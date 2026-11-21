
/* =========================================================
   LEAKA — COMPLETE APP.JS
   Authentication
   Profiles and Profile Editing
   Posts, Media Uploads, Likes and Comments
   Search and Public Profiles
   Following and Follow Requests
   Stories and Full-Screen Story Viewer
   Notifications
   Privacy and Settings
   Navigation and Event Handling
========================================================= */

(() => {
"use strict";

/* =========================================================
   1. CONFIGURATION
========================================================= */

const SUPABASE_URL = "https://kiwpmnvoqzrfwblnudjq.supabase.co";

const SUPABASE_ANON_KEY = "sb_publishable__oAt1RpObXR5PDqSG7yE1w_SkdZ0Hry";

const STORAGE_BUCKET = "leaka-media";

const supabase = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);

const db = supabase;

let currentUser = null;
let currentProfile = null;
let selectedMessageUser = null;

let currentPage = "home";
let currentStoryGroup = [];
let currentStoryIndex = 0;
let storyTimer = null;
let storyPaused = false;
let storyTouchStartX = 0;
let commentVideoToResume = null;

let selectedMedia = null;
let currentProfileTab = "posts";
let searchTimeout = null;

const $ = id => document.getElementById(id);


/* =========================================================
   2. GENERAL HELPERS
========================================================= */



function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function getInitial(name = "") {
  return escapeHTML(name.trim().charAt(0).toUpperCase() || "L");
}


function showToast(message, duration = 3000) {
  let toast = $("leakaToast");

  if (!toast) {
    toast = document.createElement("div");
    toast.id = "leakaToast";

    Object.assign(toast.style, {
      position: "fixed",
      bottom: "90px",
      left: "50%",
      transform: "translateX(-50%)",
      background: "#241632",
      color: "#fff",
      border: "1px solid #9b5cff",
      padding: "13px 20px",
      borderRadius: "13px",
      zIndex: "100000",
      maxWidth: "90%",
      textAlign: "center",
      fontSize: "13px",
      boxShadow: "0 5px 25px #0008"
    });

    document.body.appendChild(toast);
  }

  toast.textContent = message;
  toast.style.display = "block";

  clearTimeout(toast._timer);

  toast._timer = setTimeout(() => {
    toast.style.display = "none";
  }, duration);
}


function showEmpty(container, icon, heading, description) {
  if (!container) return;

  container.innerHTML = `
    <div class="empty-state">
      <div>${escapeHTML(icon)}</div>
      <h3>${escapeHTML(heading)}</h3>
      <p>${escapeHTML(description)}</p>
    </div>
  `;
}


function formatTime(date) {
  if (!date) return "";

  const time = new Date(date);
  const now = new Date();

  const seconds = Math.floor((now - time) / 1000);

  if (seconds < 60) return "Just now";
  if (seconds < 3600) return Math.floor(seconds / 60) + "m";
  if (seconds < 86400) return Math.floor(seconds / 3600) + "h";
  if (seconds < 604800) return Math.floor(seconds / 86400) + "d";

  return time.toLocaleDateString();
}

function setButtonLoading(button, loading, originalText) {
  if (!button) return;

  button.disabled = loading;
  button.textContent = loading ? "Please wait..." : originalText;
}


function getAvatar(profile, size = "") {
  const url = profile?.avatar_url;

  if (url) {
    return `<img src="${escapeHTML(url)}" alt="Avatar">`;
  }

  return getInitial(
    profile?.display_name || profile?.username || "L"
  );
}


async function getMyProfile() {
  if (!currentUser) return null;

  const { data, error } = await db
    .from("profiles")
    .select("*")
    .eq("id", currentUser.id)
    .maybeSingle();

  if (error) {
    console.error("Profile:", error);
    return null;
  }

  currentProfile = data;
  return data;
}

/* =========================================================
   3. NAVIGATION
========================================================= */




function navigateTo(page, addHistory = true) {
  const allowedPages = [
    "home",
    "search",
    "messages",
    "profile",
    "notifications",
    "requests",
    "settings"
  ];

  if (!allowedPages.includes(page)) return;

  if (!currentUser) {
    showToast("Please log in first.");
    return;
  }

  // Restore bottom navigation when leaving private chat
  if (page !== "messages" || !selectedMessageUser) {
    document.body.classList.remove("private-chat-open");

    const privateChat = $("privateChatView");
    const messagesContent = $("messagesContent");

    if (privateChat) privateChat.hidden = true;
    if (messagesContent) messagesContent.hidden = false;

    if (page !== "messages") {
      selectedMessageUser = null;
    }
  }

  if (addHistory && currentPage !== page) {
    history.pushState({ page }, "", "#" + page);
  }

  currentPage = page;

  allowedPages.forEach(name => {
    const section = $(name);
    if (section) section.hidden = name !== page;
  });

  document.querySelectorAll(".bottom-nav button").forEach(button => {
    button.classList.toggle(
      "active",
      button.dataset.page === page
    );
  });

  window.scrollTo({ top: 0, behavior: "smooth" });

  if (page === "home") {
    loadFeed();
    loadStories();
  }

  if (page === "messages") loadMessages();
  if (page === "profile") loadMyProfilePage();
  if (page === "notifications") loadNotifications();
  if (page === "requests") loadFollowRequests();
  if (page === "settings") loadSettings();
}


/* ================= LEAKA PRIVATE CHAT ================= */


async function openPrivateChat(user) {
  if (!user || !currentUser) return;

  selectedMessageUser = user;

  navigateTo("messages", false);

  const view = $("privateChatView");
  const content = $("messagesContent");

  if (!view || !content) return;

  content.hidden = true;
  view.hidden = false;

  // Hide bottom navigation
  document.body.classList.add("private-chat-open");

  $("chatUserName").textContent =
    user.display_name || user.username || "User";

  $("chatUserHandle").textContent =
    user.username ? "@" + user.username : "";

  $("chatUserAvatar").innerHTML = getAvatar(user);

  await loadPrivateChatMessages();
}




async function loadPrivateChatMessages() {
  if (!selectedMessageUser || !currentUser) return;

  const container = $("chatMessages");
  if (!container) return;

  const otherId = selectedMessageUser.id;

  try {
    // Load conversation without clearing existing messages
    const { data, error } = await db
      .from("messages")
      .select("*")
      .or(
        `and(sender_id.eq.${currentUser.id},receiver_id.eq.${otherId}),and(sender_id.eq.${otherId},receiver_id.eq.${currentUser.id})`
      )
      .order("created_at", { ascending: true });

    if (error) throw error;

    // Only render after successfully fetching
    container.innerHTML = "";

    if (!data?.length) {
      container.innerHTML =
        '<div class="empty-state"><p>Start your conversation!</p></div>';
    } else {
      data.forEach(message => {
        const bubble = document.createElement("div");

        bubble.className =
          "chat-message " +
          (message.sender_id === currentUser.id ? "sent" : "received");

        bubble.textContent = message.content;

        container.appendChild(bubble);
      });
    }

    container.scrollTop = container.scrollHeight;

    // Mark incoming messages as read
    const { error: readError } = await db
      .from("messages")
      .update({ is_read: true })
      .eq("sender_id", otherId)
      .eq("receiver_id", currentUser.id)
      .eq("is_read", false);

    if (readError) throw readError;

  } catch (error) {
    console.error("CHAT LOAD ERROR:", error);
    showToast(error.message || "Unable to load messages.");
  }
}


// SEND MESSAGE — INSTANT LOCAL UPDATE
async function sendPrivateMessage(event) {
  event.preventDefault();

  if (!selectedMessageUser || !currentUser) return;

  const input = $("chatMessageInput");
  const button = $("sendChatMessageBtn");

  const content = input.value.trim();

  if (!content) return;

  const receiverId = selectedMessageUser.id;

  button.disabled = true;

  // Preserve the message immediately
  input.value = "";

  try {
    const { data, error } = await db.rpc(
      "send_leaka_message",
      {
        p_receiver_id: receiverId,
        p_content: content
      }
    );

    if (error) throw error;

    // Do not reload the conversation.
    // Realtime will handle incoming messages.
    
    if (data?.is_request) {
      showToast("Message request sent!");
    } else {
      showToast("Message sent!");
    }

  } catch (error) {
    console.error("SEND MESSAGE ERROR:", error);

    // Restore message if sending fails
    input.value = content;

    showToast(error.message || "Could not send message.");

  } finally {
    button.disabled = false;
    input.focus();
  }
}


// BACK TO INBOX
$("backToMessagesBtn")?.addEventListener("click", () => {
  $("privateChatView").hidden = true;
  $("messagesContent").hidden = false;

  // Restore bottom navigation
  document.body.classList.remove("private-chat-open");

  selectedMessageUser = null;

  loadMessages();
});

// MESSAGE FORM
$("chatMessageForm")?.addEventListener(
  "submit",
  sendPrivateMessage
);


// END PRIVATE CHAT


function initializeNavigation() {
  document.querySelectorAll("[data-page]").forEach(button => {
    button.addEventListener("click", () => {
      navigateTo(button.dataset.page);
    });
  });

  // OPEN CREATE POST MODAL
  document.querySelector('[data-action="create-post"]')
    ?.addEventListener("click", () => {
      const modal = $("createPostModal");

      if (!modal) return;

      modal.hidden = false;
      document.body.classList.add("create-modal-open");

      $("caption")?.focus();
    });

  // CLOSE CREATE POST MODAL
  document.querySelectorAll("[data-close-create-post]")
    .forEach(button => {
      button.addEventListener("click", closeCreatePostModal);
    });

  $("profileBtn")?.addEventListener("click", () => {
    navigateTo("profile");
  });

  $("settingsGear")?.addEventListener("click", () => {
    navigateTo("settings");
  });
  
    // OPEN SEARCH FROM HOME
  $("homeSearchBtn")?.addEventListener("click", () => {
    navigateTo("search");
  });
  
  
  // MESSAGES TAB SWITCHING
  document.querySelectorAll("[data-message-tab]").forEach(button => {
    button.addEventListener("click", () => {
      const tab = button.dataset.messageTab;

      const tabs = {
        chats: $("chatsTab"),
        requests: $("messageRequestsTab"),
        sent: $("sentMessagesTab")
      };

      Object.entries(tabs).forEach(([name, section]) => {
        if (section) {
          section.hidden = name !== tab;
        }
      });

      document.querySelectorAll("[data-message-tab]").forEach(btn => {
        btn.classList.toggle("active", btn === button);
      });
    });
  });

}

function closeCreatePostModal() {
  const modal = $("createPostModal");

  if (!modal) return;

  modal.hidden = true;
  document.body.classList.remove("create-modal-open");
}


/* =========================================================
   4. AUTHENTICATION
========================================================= */

async function signUp() {
  const email = $("email")?.value.trim();
  const password = $("password")?.value;

  if (!email || !password) {
    showToast("Enter your email and password.");
    return;
  }

  if (password.length < 6) {
    showToast("Password must contain at least 6 characters.");
    return;
  }

  const button = $("signupBtn");

  setButtonLoading(button, true, "Create Account");

  const { data, error } = await db.auth.signUp({
    email,
    password
  });

  setButtonLoading(button, false, "Create Account");

  if (error) {
    $("authMessage").textContent = error.message;
    return;
  }

  if (data.session) {
    currentUser = data.user;
    await initializeApp();
  } else {
    $("authMessage").textContent =
      "Account created! Check your email to confirm your account, then log in.";
  }
}


async function signIn() {
  const email = $("email")?.value.trim();
  const password = $("password")?.value;

  if (!email || !password) {
    showToast("Enter your email and password.");
    return;
  }

  const button = $("loginBtn");

  setButtonLoading(button, true, "Log In");

  try {
    const { data, error } = await db.auth.signInWithPassword({
      email,
      password
    });

    if (error) throw error;

    currentUser = data.user;

    await initializeApp();

  } catch (error) {
    console.error("LOGIN ERROR:", error);

    if ($("authMessage")) {
      $("authMessage").textContent = error.message;
    }

  } finally {
    setButtonLoading(button, false, "Log In");
  }
}

async function signOut() {
  if (!confirm("Are you sure you want to log out?")) return;

  const { error } = await db.auth.signOut();

  if (error) {
    showToast(error.message);
    return;
  }

  currentUser = null;
  currentProfile = null;

  $("appContent").hidden = true;
  $("auth").hidden = false;

  $("password").value = "";

  showToast("Logged out successfully.");
}



function initializeAuthentication() {
  $("loginBtn")?.addEventListener("click", signIn);
  $("signupBtn")?.addEventListener("click", signUp);

  $("logoutBtn")?.addEventListener("click", signOut);
  $("settingsLogoutBtn")?.addEventListener("click", signOut);

  $("password")?.addEventListener("keydown", event => {
    if (event.key === "Enter") signIn();
  });

  db.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_OUT") {
      currentUser = null;
      currentProfile = null;

      if ($("auth")) $("auth").hidden = false;
      if ($("appContent")) $("appContent").hidden = true;
    }

    if (session?.user) {
      currentUser = session.user;
    }
  });
}


/* =========================================================
   5. APP INITIALIZATION
========================================================= */


async function initializeApp() {
  if (!currentUser) return;

  $("auth").hidden = true;
  $("appContent").hidden = false;

  try {
    const profile = await getMyProfile();

    if (!profile) {
      throw new Error(
        "Your profile could not be loaded. Check your profiles table and permissions."
      );
    }

    await loadFeed();
    await loadMyProfilePage();

    closeCreatePostModal();

    await loadStories();
    await loadNotifications();
    await loadFollowRequests();
    await loadSettings();

    navigateTo("home");

  } catch (error) {
    console.error("APP INITIALIZATION ERROR:", error);
    showToast(error.message || "Could not initialize LEAKA.");
  }
}



async function checkSession() {
  try {
    const { data, error } = await db.auth.getSession();

    if (error) throw error;

    if (data.session) {
      currentUser = data.session.user;
      await initializeApp();
    } else {
      currentUser = null;
      currentProfile = null;

      $("auth").hidden = false;
      $("appContent").hidden = true;
    }

  } catch (error) {
    console.error("SESSION ERROR:", error);
    showToast("Could not check your login session: " + error.message);
  }
}



/* =========================================================
   6. STORAGE UPLOADS
========================================================= */

async function uploadFile(file, folder) {
  if (!file || !currentUser) return null;

  const allowedTypes = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "video/mp4",
    "video/webm",
    "video/quicktime"
  ];

  if (!allowedTypes.includes(file.type)) {
    showToast("Unsupported media format.");
    return null;
  }

  const maxSize = folder === "stories"
    ? 50 * 1024 * 1024
    : 25 * 1024 * 1024;

  if (file.size > maxSize) {
    showToast("File is too large. Maximum size is 50 MB for stories and 25 MB for other uploads.");
    return null;
  }

  const extension = file.name.split(".").pop().toLowerCase();

  
const path = `${folder}/${currentUser.id}/${Date.now()}-${crypto.randomUUID()}.${extension}`;


  const { error } = await db.storage
    .from(STORAGE_BUCKET)
    .upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type
    });

  if (error) {
    console.error("Upload:", error);
    showToast("Upload failed: " + error.message);
    return null;
  }

  const { data } = db.storage
    .from(STORAGE_BUCKET)
    .getPublicUrl(path);

  return data.publicUrl;
}


/* =========================================================
   7. CREATE POST PREVIEW
========================================================= */

function initializePostPreview() {
  $("mediaInput")?.addEventListener("change", event => {
    const file = event.target.files?.[0];

    selectedMedia = file || null;

    const preview = $("preview");

    if (!preview) return;

    preview.innerHTML = "";

    if (!file) return;

    const url = URL.createObjectURL(file);

    if (file.type.startsWith("video/")) {
      preview.innerHTML = `
        <video controls playsinline src="${url}"></video>
      `;
    } else if (file.type.startsWith("image/")) {
      preview.innerHTML = `
        <img src="${url}" alt="Post preview">
      `;
    } else {
      selectedMedia = null;
      showToast("Choose an image or video.");
    }
  });

  $("postBtn")?.addEventListener("click", createPost);
}


/* =========================================================
   8. PUBLISH POSTS
========================================================= */

async function createPost() {
  const caption = $("caption")?.value.trim();

  if (!caption && !selectedMedia) {
    showToast("Write something or attach media.");
    return;
  }

  const button = $("postBtn");

  setButtonLoading(button, true, "Publish");

  let mediaUrl = null;
  let mediaType = null;

  if (selectedMedia) {
    mediaUrl = await uploadFile(selectedMedia, "posts");

    if (!mediaUrl) {
      setButtonLoading(button, false, "Publish");
      return;
    }

    mediaType = selectedMedia.type.startsWith("video/")
      ? "video"
      : "image";
  }

  const { error } = await db
    .from("posts")
    .insert({
      user_id: currentUser.id,
      caption,
      media_url: mediaUrl,
      media_type: mediaType
    });

  setButtonLoading(button, false, "Publish");

  if (error) {
    console.error(error);
    showToast("Could not publish: " + error.message);
    return;
  }

  $("caption").value = "";
  $("mediaInput").value = "";
  $("preview").innerHTML = "";

  selectedMedia = null;

  showToast("Your post has been published!");

  await loadFeed();
  await loadMyProfilePage();
}


/* =========================================================
   9. LOAD FEED
========================================================= */



async function loadFeed() {
  const container = $("posts");

  if (!container || !currentUser) return;

  container.innerHTML = `
    <div class="empty-state">
      <div class="leaka-spinner"></div>
      <h3>Loading your feed...</h3>
    </div>
  `;

  const { data: posts, error } = await db
    .from("posts")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(60);

  if (error) {
    console.error("Feed:", error);
    showEmpty(
      container,
      "!",
      "Feed unavailable",
      "Could not load posts. Check your connection."
    );
    return;
  }

  if (!posts || !posts.length) {
    showEmpty(
      container,
      "✦",
      "Nothing here yet",
      "Be the first to share something with LEAKA."
    );
    return;
  }

  const visiblePosts = [];

  for (const post of posts) {
    const { data: author } = await db
      .from("profiles")
      .select("*")
      .eq("id", post.user_id)
      .maybeSingle();

    if (!author) continue;

    if (author.is_private && author.id !== currentUser.id) {
      const { data: follow } = await db
        .from("follows")
        .select("follower_id")
        .eq("follower_id", currentUser.id)
        .eq("following_id", author.id)
        .maybeSingle();

      if (!follow) continue;
    }

    visiblePosts.push({ ...post, author });
  }

  const postIds = visiblePosts.map(post => post.id);

  let likes = [];
  let comments = [];
  let commentProfiles = {};
  let commentLikes = [];

  if (postIds.length) {
    const [likeResult, commentResult] = await Promise.all([
      db.from("likes")
        .select("*")
        .in("post_id", postIds),

      db.from("comments")
        .select("*")
        .in("post_id", postIds)
        .order("created_at", { ascending: true })
    ]);

    if (!likeResult.error) {
      likes = likeResult.data || [];
    }

    if (!commentResult.error) {
      comments = commentResult.data || [];
    }

    const commentIds = comments.map(comment => comment.id);

    if (commentIds.length) {
      const { data, error } = await db
        .from("comment_likes")
        .select("comment_id, user_id")
        .in("comment_id", commentIds);

      if (error) {
        console.error("COMMENT LIKES:", error);
      } else {
        commentLikes = data || [];
      }
    }

    const commenterIds = [
      ...new Set(
        comments.map(comment => comment.user_id).filter(Boolean)
      )
    ];

    if (commenterIds.length) {
      const { data, error } = await db
        .from("profiles")
        .select("id, username, display_name")
        .in("id", commenterIds);

      if (error) {
        console.error("COMMENT PROFILES:", error);
      } else {
        (data || []).forEach(profile => {
          commentProfiles[profile.id] = profile;
        });
      }
    }
  }

  container.innerHTML = "";

  for (const post of visiblePosts) {
    const postLikes = likes.filter(
      like => like.post_id === post.id
    );

    const postComments = comments.filter(
      comment => comment.post_id === post.id
    );

    const liked = postLikes.some(
      like => like.user_id === currentUser.id
    );

    const author = post.author;

    const avatar = author.avatar_url
      ? `<img src="${escapeHTML(author.avatar_url)}" alt="">`
      : getInitial(author.display_name || author.username);

    const media = post.media_url
      ? post.media_type === "video"
        ? `<video class="post-media" controls playsinline src="${escapeHTML(post.media_url)}"></video>`
        : `<img class="post-media" src="${escapeHTML(post.media_url)}" alt="Post image" loading="lazy">`
      : "";

    const caption = post.caption
      ? `<p class="post-caption">${escapeHTML(post.caption)}</p>`
      : "";

    const topLevelComments = postComments
      .filter(comment => !comment.parent_comment_id)
      .sort((a, b) => {
        const aLikes = commentLikes.filter(
          like => like.comment_id === a.id
        ).length;

        const bLikes = commentLikes.filter(
          like => like.comment_id === b.id
        ).length;

        return bLikes - aLikes ||
          new Date(a.created_at) - new Date(b.created_at);
      });

    // Render comments and nested replies.
    // Every reply thread starts hidden.
    const renderComment = (
      comment,
      depth = 0,
      ancestors = new Set()
    ) => {
      if (ancestors.has(comment.id)) return "";

      const nextAncestors = new Set(ancestors);
      nextAncestors.add(comment.id);

      const commenter = commentProfiles[comment.user_id];

     const parentComment = postComments.find(
  item => item.id === comment.parent_comment_id
);

const parentProfile = parentComment
  ? commentProfiles[parentComment.user_id]
  : null;

const replyingTo = parentProfile
  ? parentProfile.username || parentProfile.display_name || "User"
  : null;

      const username =
        commenter?.username ||
        commenter?.display_name ||
        "User";

      const isCreator = comment.user_id === post.user_id;

      const commentLikeList = commentLikes.filter(
        like => like.comment_id === comment.id
      );

      const commentLiked = commentLikeList.some(
        like => like.user_id === currentUser.id
      );

      const replies = postComments
        .filter(reply => reply.parent_comment_id === comment.id)
        .sort((a, b) =>
          new Date(a.created_at) - new Date(b.created_at)
        );

      const replyHTML = replies
        .map(reply =>
          renderComment(reply, depth + 1, nextAncestors)
        )
        .join("");

      const replyToggle = replies.length
        ? `
          <button
            type="button"
            class="view-replies-btn"
            data-toggle-replies
            data-reply-count="${replies.length}">
            View replies (${replies.length})
          </button>
        `
        : "";

      return `
      
<div
  class="leaka-comment ${depth > 0 ? "reply-comment" : ""}"
  data-comment-id="${escapeHTML(comment.id)}"
>
  <div class="leaka-comment-content">

    <strong>${escapeHTML(username)}</strong>

    ${replyingTo
      ? `<small class="replying-to">
           Replying to @${escapeHTML(replyingTo)}
         </small>`
      : ""}


            ${isCreator
              ? `<span class="creator-badge">CREATOR</span>`
              : ""}

            <p>${escapeHTML(comment.content || "")}</p>

            <div class="comment-actions">

              <button
                type="button"
                class="comment-like-btn ${commentLiked ? "liked" : ""}"
                data-like-comment="${escapeHTML(comment.id)}">
                ${commentLiked ? "♥" : "♡"}
                <span>${commentLikeList.length}</span>
              </button>

              <button
                type="button"
                class="comment-reply-btn"
                data-reply-comment="${escapeHTML(comment.id)}">
                Reply
              </button>

              <small>${formatTime(comment.created_at)}</small>

            </div>

            ${replyToggle}

            <div
              class="comment-replies"
              ${replies.length ? "hidden" : ""}>
              ${replyHTML}
            </div>

          </div>
        </div>
      `;
    };

    const commentHTML = topLevelComments
      .map(comment => renderComment(comment))
      .join("");

    const card = document.createElement("article");

    card.className = "post-card";
    card.dataset.creatorId = post.user_id;

    card.innerHTML = `
      <div class="post-header">

        <div
          class="post-avatar"
          data-open-profile="${escapeHTML(author.id)}">
          ${avatar}
        </div>

        <div style="flex:1;min-width:0">

          <div
            class="post-user"
            data-open-profile="${escapeHTML(author.id)}">
            ${escapeHTML(
              author.display_name ||
              author.username ||
              "LEAKA User"
            )}
          </div>

          <div class="post-time">
            @${escapeHTML(author.username || "user")}
            · ${formatTime(post.created_at)}
          </div>

        </div>

        ${post.user_id === currentUser.id
          ? `<button class="danger" data-delete-post="${escapeHTML(post.id)}">Delete</button>`
          : ""}
      </div>

      ${caption}

      ${media}

      <div class="post-actions">

        <button
          class="action-btn ${liked ? "liked" : ""}"
          data-like-post="${escapeHTML(post.id)}">
          ${liked ? "♥" : "♡"} ${postLikes.length}
        </button>

        <button
          class="action-btn"
          data-focus-comment="${escapeHTML(post.id)}">
          💬 ${postComments.length}
        </button>

      </div>

      <div
        class="comments"
        id="comments-${escapeHTML(post.id)}">
        ${commentHTML}
      </div>

      <div class="comment-area">

        <input
          type="text"
          id="comment-input-${escapeHTML(post.id)}"
          placeholder="Write a comment..."
          maxlength="1000">

        <button
          type="button"
          data-submit-comment="${escapeHTML(post.id)}">
          Send
        </button>

      </div>
    `;

    container.appendChild(card);
  }
}


/* =========================================================
   10. LIKE POSTS
========================================================= */


async function toggleLike(postId) {
  const card = document
    .querySelector(`[data-like-post="${postId}"]`)
    ?.closest(".post-card");

  const likeButton = card?.querySelector(
    "[data-like-post]"
  );

  if (!likeButton) return;

  likeButton.disabled = true;

  const wasLiked = likeButton.classList.contains("liked");

  const currentCount = Number(
    likeButton.textContent.match(/\d+/)?.[0] || 0
  );

  const newCount = wasLiked
    ? currentCount - 1
    : currentCount + 1;

  // Update the button immediately
  likeButton.classList.toggle("liked", !wasLiked);
  likeButton.textContent =
  `${wasLiked ? "♡" : "♥"} ${Math.max(0, newCount)}`;

  const { data: existing, error: findError } = await db
    .from("likes")
    .select("post_id, user_id")
    .eq("post_id", postId)
    .eq("user_id", currentUser.id)
    .maybeSingle();

  if (findError) {
    console.error("LIKE CHECK ERROR:", findError);
    showToast(findError.message);

    likeButton.classList.toggle("liked", wasLiked);
    likeButton.textContent =
      `${wasLiked ? "♥" : "♡"} ${currentCount}`;

    likeButton.disabled = false;
    return;
  }

  let error;

  if (existing) {
    ({ error } = await db
      .from("likes")
      .delete()
      .eq("post_id", postId)
      .eq("user_id", currentUser.id));
  } else {
    ({ error } = await db
      .from("likes")
      .insert({
        post_id: postId,
        user_id: currentUser.id
      }));
  }

  if (error) {
    console.error("LIKE ERROR:", error);
    showToast(error.message);

    likeButton.classList.toggle("liked", wasLiked);
    likeButton.textContent =
      `${wasLiked ? "♥" : "♡"} ${currentCount}`;
  }

  likeButton.disabled = false;
}


async function toggleCommentLike(commentId) {
  const buttons = [
    ...document.querySelectorAll(
  `[data-like-comment="${commentId}"]`
)
  ];

  if (!buttons.length) return;

  buttons.forEach(button => button.disabled = true);

  const originalStates = buttons.map(button => ({
    liked: button.classList.contains("liked"),
    count: Number(button.querySelector("span")?.textContent || 0)
  }));

  const wasLiked = originalStates[0].liked;

  // Optimistic update
  buttons.forEach(button => {
    const count = Number(
      button.querySelector("span")?.textContent || 0
    );

    button.classList.toggle("liked", !wasLiked);
    button.innerHTML = `
      ${wasLiked ? "♡" : "♥"}
      <span>${Math.max(0, count + (wasLiked ? -1 : 1))}</span>
    `;
  });

  const { data: existing, error: findError } = await db
    .from("comment_likes")
    .select("comment_id, user_id")
    .eq("comment_id", commentId)
    .eq("user_id", currentUser.id)
    .maybeSingle();

  if (findError) {
    showToast("Could not check comment like.");

    buttons.forEach((button, index) => {
      button.classList.toggle("liked", originalStates[index].liked);
      button.innerHTML = `
        ${originalStates[index].liked ? "♥" : "♡"}
        <span>${originalStates[index].count}</span>
      `;
      button.disabled = false;
    });

    return;
  }

  let error;

  if (existing) {
    ({ error } = await db
      .from("comment_likes")
      .delete()
      .eq("comment_id", commentId)
      .eq("user_id", currentUser.id));
  } else {
    ({ error } = await db
      .from("comment_likes")
      .insert({
        comment_id: commentId,
        user_id: currentUser.id
      }));
  }

  if (error) {
    showToast(error.message);

    buttons.forEach((button, index) => {
      button.classList.toggle("liked", originalStates[index].liked);
      button.innerHTML = `
        ${originalStates[index].liked ? "♥" : "♡"}
        <span>${originalStates[index].count}</span>
      `;
    });
  }

  buttons.forEach(button => button.disabled = false);
}



async function submitCommentReply(commentId, button) {
  const composer = button.closest(".reply-composer");
  const input = composer?.querySelector("input");
  const content = input?.value.trim();

  if (!content || !currentUser) return;

  button.disabled = true;

  try {
    // Find the comment being replied to
    const { data: parent, error: parentError } = await db
      .from("comments")
      .select("id, post_id")
      .eq("id", commentId)
      .maybeSingle();

    if (parentError || !parent) {
      throw new Error("Original comment not found.");
    }

    // Save reply to Supabase
    const { data: reply, error } = await db
      .from("comments")
      .insert({
        post_id: parent.post_id,
        user_id: currentUser.id,
        content,
        parent_comment_id: commentId
      })
      .select()
      .single();

    if (error) throw error;

    // Get current username
    const username =
      currentProfile?.username ||
      currentProfile?.display_name ||
      "You";

    // Check if current user owns the post
    const postElement = document.querySelector(
  `[data-submit-comment="${parent.post_id}"]`
)?.closest(".post-card");

const isCreator =
  postElement?.dataset?.creatorId === currentUser.id;

    // Create reply element safely
    const replyElement = document.createElement("div");
    replyElement.className = "leaka-comment reply-comment";
    replyElement.dataset.commentId = reply.id;

    const contentElement = document.createElement("div");
    contentElement.className = "leaka-comment-content";

    const name = document.createElement("strong");
    name.textContent = username;
    contentElement.appendChild(name);

    if (isCreator) {
      const badge = document.createElement("span");
      badge.className = "creator-badge";
      badge.textContent = "CREATOR";
      contentElement.appendChild(badge);
    }

    const paragraph = document.createElement("p");
    paragraph.textContent = reply.content;
    contentElement.appendChild(paragraph);

    const actions = document.createElement("div");
    actions.className = "comment-actions";

    const likeButton = document.createElement("button");
    likeButton.type = "button";
    likeButton.className = "comment-like-btn";
    likeButton.dataset.likeComment = reply.id;
    likeButton.innerHTML = '♡ <span>0</span>';

    actions.appendChild(likeButton);
    contentElement.appendChild(actions);

    // Add reply button for nested replies
    const replyButton = document.createElement("button");
    replyButton.type = "button";
    replyButton.className = "comment-reply-btn";
    replyButton.dataset.replyComment = reply.id;
    replyButton.textContent = "Reply";

    actions.appendChild(replyButton);

    // Add nested reply composer
    const nestedComposer = document.createElement("div");
    nestedComposer.className = "reply-composer";
    nestedComposer.id = `reply-composer-${reply.id}`;
    nestedComposer.hidden = true;

    const nestedInput = document.createElement("input");
    nestedInput.type = "text";
    nestedInput.maxLength = 1000;
    nestedInput.placeholder = "Write a reply...";
    nestedInput.id = `reply-input-${reply.id}`;

    const sendButton = document.createElement("button");
    sendButton.type = "button";
    sendButton.dataset.sendReply = reply.id;
    sendButton.textContent = "Send";

    nestedComposer.appendChild(nestedInput);
    nestedComposer.appendChild(sendButton);

    contentElement.appendChild(nestedComposer);

    // Container for replies to this reply
    const nestedReplies = document.createElement("div");
    nestedReplies.className = "comment-replies";

    contentElement.appendChild(nestedReplies);
    replyElement.appendChild(contentElement);

    // Insert into the correct parent comment
    const parentComment = document.querySelector(
  `[data-comment-id="${commentId}"]`
);

const repliesContainer = parentComment?.querySelector(
  ":scope > .leaka-comment-content > .comment-replies"
);

if (repliesContainer) {
  repliesContainer.hidden = false;
  repliesContainer.appendChild(replyElement);
}

    input.value = "";
    composer.hidden = true;

    showToast("Reply added!");

  } catch (error) {
    console.error("REPLY ERROR:", error);
    showToast("Could not send reply: " + error.message);
  } finally {
    button.disabled = false;
  }
}


/* =========================================================
   11. COMMENTS
========================================================= */

async function submitComment(postId) {
  const overlay = $("leakaCommentsOverlay");

  const overlayIsOpen =
    overlay &&
    !overlay.hidden &&
    overlay.dataset.postId === postId;

  const input = overlayIsOpen
    ? $("activeCommentInput")
    : $("comment-input-" + postId);

  const content = input?.value.trim();

  if (!content || !currentUser || !input) return;

  const sendButton = overlayIsOpen
    ? $("activeCommentSend")
    : document.querySelector(
        `[data-submit-comment="${postId}"]`
      );

  const parentCommentId = input.dataset.replyTo || null;

  if (sendButton) sendButton.disabled = true;

  try {
    const { error } = await db
      .from("comments")
      .insert({
        post_id: postId,
        user_id: currentUser.id,
        content,
        parent_comment_id: parentCommentId
      });

    if (error) throw error;

    input.value = "";
    delete input.dataset.replyTo;
    input.placeholder = "Write a comment...";

    showToast(parentCommentId ? "Reply added!" : "Comment added!");

    await loadFeed();

    if (overlayIsOpen) {
      openComments(postId);
    }

  } catch (error) {
    console.error("COMMENT ERROR:", error);
    showToast("Could not send comment: " + error.message);

  } finally {
    if (sendButton) sendButton.disabled = false;
  }
}

/* =========================================================
   12. DELETE POSTS
========================================================= */

async function deletePost(postId) {
  if (!confirm("Delete this post permanently?")) return;

  const { error } = await db
    .from("posts")
    .delete()
    .eq("id", postId)
    .eq("user_id", currentUser.id);

  if (error) {
    showToast(error.message);
    return;
  }

  showToast("Post deleted.");

  await loadFeed();
  await loadMyProfilePage();
}


/* =========================================================
   13. PROFILE PAGE
========================================================= */

async function loadMyProfilePage() {
  if (!currentUser) return;

  const profile = await getMyProfile();

  if (!profile) return;

  const name = profile.display_name || profile.username || "LEAKA User";

  $("profileName").textContent = name;

  $("profileEmail").textContent =
    "@" + (profile.username || "");

  $("profileBio").textContent =
    profile.bio || "Welcome to my LEAKA profile.";

  const avatar = $("profileAvatar");

  if (avatar) {
    avatar.innerHTML = getAvatar(profile);
  }

  const headerAvatar = $("editAvatar");

  if (headerAvatar) {
    headerAvatar.src = profile.avatar_url || "";
  }

  const cover = $("profileCoverImage");

  if (cover) {
    cover.src = profile.cover_url || "";
    cover.hidden = !profile.cover_url;
  }

  $("displayName").value = profile.display_name || "";
  $("bioInput").value = profile.bio || "";

  const [posts, followers, following] = await Promise.all([
    db.from("posts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", currentUser.id),

    db.from("follows")
      .select("follower_id", { count: "exact", head: true })
      .eq("following_id", currentUser.id),

    db.from("follows")
      .select("following_id", { count: "exact", head: true })
      .eq("follower_id", currentUser.id)
  ]);

  $("postCount").textContent = posts.count || 0;
  $("followerCount").textContent = followers.count || 0;
  $("followingCount").textContent = following.count || 0;

  await loadProfilePosts();
}


/* =========================================================
   14. PROFILE POST GRID
========================================================= */

async function loadProfilePosts() {
  const container = $("profilePosts");

  if (!container) return;

  const { data, error } = await db
    .from("posts")
    .select("*")
    .eq("user_id", currentUser.id)
    .order("created_at", { ascending: false });

  if (error) {
    showToast("Could not load your posts.");
    return;
  }

  let posts = data || [];

  if (currentProfileTab === "media") {
    posts = posts.filter(post => !!post.media_url);
  }

  if (!posts.length) {
    showEmpty(
      container,
      "▦",
      "Nothing to show",
      currentProfileTab === "media"
        ? "Your photo and video posts will appear here."
        : "Your posts will appear here."
    );

    return;
  }

  container.innerHTML = posts.map(post => `
    <div class="public-profile-post"
         data-open-post="${escapeHTML(post.id)}">

      ${post.media_url
        ? post.media_type === "video"
          ? `<video src="${escapeHTML(post.media_url)}" muted></video>`
          : `<img src="${escapeHTML(post.media_url)}" loading="lazy" alt="">`
        : `<span>✦</span>`
      }

    </div>
  `).join("");
}


/* =========================================================
   15. EDIT PROFILE
========================================================= */

function initializeProfileEditor() {
  $("editProfileToggle")?.addEventListener("click", () => {
    const section = $("profileEditSection");

    section.hidden = !section.hidden;
  });

  $("saveProfileBtn")?.addEventListener("click", saveProfile);

  $("avatarInput")?.addEventListener("change", async event => {
    const file = event.target.files?.[0];

    if (!file) return;

    if (!file.type.startsWith("image/")) {
      showToast("Choose an image.");
      return;
    }

    const url = await uploadFile(file, "avatars");

    if (!url) return;

    const { error } = await db
      .from("profiles")
      .update({ avatar_url: url })
      .eq("id", currentUser.id);

    if (error) {
      showToast(error.message);
      return;
    }

    showToast("Profile picture updated!");

    await loadMyProfilePage();
  });

  $("coverInput")?.addEventListener("change", async event => {
    const file = event.target.files?.[0];

    if (!file) return;

    if (!file.type.startsWith("image/")) {
      showToast("Choose an image.");
      return;
    }

    const url = await uploadFile(file, "covers");

    if (!url) return;

    const { error } = await db
      .from("profiles")
      .update({ cover_url: url })
      .eq("id", currentUser.id);

    if (error) {
      showToast(error.message);
      return;
    }

    showToast("Cover photo updated!");

    await loadMyProfilePage();
  });
}

async function saveProfile() {
  const displayName = $("displayName").value.trim();
  const bio = $("bioInput").value.trim();

  if (!displayName) {
    showToast("Enter a display name.");
    return;
  }

  const button = $("saveProfileBtn");

  setButtonLoading(button, true, "Save Changes");

  const { error } = await db
    .from("profiles")
    .update({
      display_name: displayName,
      bio
    })
    .eq("id", currentUser.id);

  setButtonLoading(button, false, "Save Changes");

  if (error) {
    showToast(error.message);
    return;
  }

  showToast("Profile updated!");

  $("profileEditSection").hidden = true;

  await loadMyProfilePage();
}


/* =========================================================
   16. PROFILE TABS
========================================================= */


function initializeProfileTabs() {

  // EXISTING POSTS AND MEDIA TABS

  document.querySelectorAll("[data-profile-tab]").forEach(button => {
    button.addEventListener("click", () => {
      currentProfileTab = button.dataset.profileTab;

      document.querySelectorAll("[data-profile-tab]").forEach(tab => {
        tab.classList.toggle("selected", tab === button);
      });

      loadProfilePosts();
    });
  });

  // LOAD FOLLOWERS OR FOLLOWING

  async function loadProfileFollowList(type) {
    if (!currentUser) return;

    const container = $("profileFollowList");
    const title = $("profileFollowTitle");

    if (!container || !title) return;

    title.textContent =
      type === "followers" ? "Followers" : "Following";

    container.innerHTML = `
      <div class="empty-state">
        <div class="leaka-spinner"></div>
        <h3>Loading...</h3>
      </div>
    `;

    let query;

    if (type === "followers") {
      query = db.from("follows")
        .select("follower_id")
        .eq("following_id", currentUser.id);
    } else {
      query = db.from("follows")
        .select("following_id")
        .eq("follower_id", currentUser.id);
    }

    const { data, error } = await query;

    if (error) {
      showEmpty(
        container,
        "!",
        "Unable to load",
        error.message
      );
      return;
    }

    if (!data?.length) {
      showEmpty(
        container,
        "♧",
        type === "followers"
          ? "No followers yet"
          : "Not following anyone",
        type === "followers"
          ? "People who follow you will appear here."
          : "People you follow will appear here."
      );
      return;
    }

    const ids = data.map(item =>
      type === "followers"
        ? item.follower_id
        : item.following_id
    );

    const { data: users, error: profileError } = await db
      .from("profiles")
      .select("*")
      .in("id", ids);

    if (profileError) {
      showEmpty(
        container,
        "!",
        "Unable to load accounts",
        profileError.message
      );
      return;
    }

    container.innerHTML = "";

    for (const user of users || []) {

      const item = document.createElement("button");

      item.type = "button";
      item.className = "request-list-item";
      item.dataset.openProfile = user.id;

      item.innerHTML = `
        <div class="request-avatar">
          ${getAvatar(user)}
        </div>

        <div class="request-info">
          <strong>
            ${escapeHTML(user.display_name || user.username || "User")}
          </strong>

          <small>
            @${escapeHTML(user.username || "")}
          </small>
        </div>

        <span class="profile-user-arrow">›</span>
      `;

      container.appendChild(item);
    }

    if (!container.children.length) {
      showEmpty(
        container,
        "♧",
        "No accounts found",
        "There are no accounts to display."
      );
    }
  }

  // OPEN FOLLOWERS

  $("openFollowersBtn")?.addEventListener("click", async () => {

    $("profilePosts").hidden = true;
    document.querySelector(".profile-tabs").hidden = true;

    $("profileFollowViewer").hidden = false;

    await loadProfileFollowList("followers");
  });

  // OPEN FOLLOWING

  $("openFollowingBtn")?.addEventListener("click", async () => {

    $("profilePosts").hidden = true;
    document.querySelector(".profile-tabs").hidden = true;

    $("profileFollowViewer").hidden = false;

    await loadProfileFollowList("following");
  });

  // RETURN TO PROFILE

  $("backToProfileBtn")?.addEventListener("click", () => {

    $("profileFollowViewer").hidden = true;

    $("profilePosts").hidden = false;
    document.querySelector(".profile-tabs").hidden = false;

  });

}


/* =========================================================
   17. SEARCH USERS
========================================================= */

function initializeSearch() {
  $("searchInput")?.addEventListener("input", event => {
    clearTimeout(searchTimeout);

    const query = event.target.value.trim();

    searchTimeout = setTimeout(() => {
      searchUsers(query);
    }, 350);
  });
}

async function searchUsers(query) {
  const container = $("searchResults");

  if (!container) return;

  if (!query) {
    showEmpty(
      container,
      "⌕",
      "Find your people",
      "Search for a username to get started."
    );

    return;
  }

  const { data, error } = await db
    .from("profiles")
    .select("*")
    .ilike("username", "%" + query + "%")
    .neq("id", currentUser.id)
    .limit(30);

  if (error) {
    showEmpty(container, "!", "Search failed", error.message);
    return;
  }

  if (!data?.length) {
    showEmpty(
      container,
      "⌕",
      "No users found",
      "Try a different username."
    );

    return;
  }

  container.innerHTML = "";

  for (const user of data) {
    const { data: following } = await db
      .from("follows")
      .select("follower_id")
      .eq("follower_id", currentUser.id)
      .eq("following_id", user.id)
      .maybeSingle();

    const item = document.createElement("div");

    item.className = "search-user";

    item.innerHTML = `
      <div class="search-user-avatar">
        ${getAvatar(user)}
      </div>

      <div style="flex:1;min-width:0">
        <strong>${escapeHTML(user.display_name || user.username)}</strong>
        <span>@${escapeHTML(user.username || "")}</span>
      </div>

      <span>${following ? "Following" : "View"}</span>
    `;

    item.addEventListener("click", () => {
      openPublicProfile(user.id);
    });

    container.appendChild(item);
  }
}


/* =========================================================
   18. PUBLIC PROFILE
========================================================= */

async function openPublicProfile(userId) {
  if (userId === currentUser.id) {
    navigateTo("profile");
    return;
  }

  let overlay = $("publicProfileOverlay");

  if (!overlay) {
    overlay = document.createElement("div");

    overlay.id = "publicProfileOverlay";

    overlay.innerHTML = `
      <div class="public-profile-card">

        <div class="public-profile-loading">
          <div class="leaka-spinner"></div>
          <small>Loading profile...</small>
        </div>

      </div>
    `;

    document.body.appendChild(overlay);
  }

  overlay.hidden = false;

  const { data: user, error } = await db
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (error || !user) {
    overlay.innerHTML = `
      <div class="public-profile-card public-profile-body">
        <h3>Profile unavailable</h3>
        <button class="public-profile-close">Close</button>
      </div>
    `;

    return;
  }

  const { data: following } = await db
    .from("follows")
    .select("*")
    .eq("follower_id", currentUser.id)
    .eq("following_id", userId)
    .maybeSingle();

  const { data: pending } = await db
    .from("follow_requests")
    .select("*")
    .eq("requester_id", currentUser.id)
    .eq("receiver_id", userId)
    .eq("status", "pending")
    .maybeSingle();

  const isPrivate = !!user.is_private;
  const canSeePosts = !isPrivate || !!following;

  const [postCount, followers, followings] = await Promise.all([
    db.from("posts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId),

    db.from("follows")
      .select("follower_id", { count: "exact", head: true })
      .eq("following_id", userId),

    db.from("follows")
      .select("following_id", { count: "exact", head: true })
      .eq("follower_id", userId)
  ]);

  let posts = [];

  if (canSeePosts) {
    const result = await db
      .from("posts")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    posts = result.data || [];
  }

  const cover = user.cover_url
    ? `<img src="${escapeHTML(user.cover_url)}" alt="">`
    : "";

  const postGrid = canSeePosts
    ? posts.length
      ? posts.map(post => `
          <div class="public-profile-post">
            ${post.media_url
              ? post.media_type === "video"
                ? `<video src="${escapeHTML(post.media_url)}" muted></video>`
                : `<img src="${escapeHTML(post.media_url)}" alt="">`
              : `<span>✦</span>`
            }
          </div>
        `).join("")
      : `<div class="public-profile-post-empty">No posts yet.</div>`
    : `
      <div class="public-profile-private">
        <div style="font-size:35px">🔒</div>
        <strong>This account is private</strong>
        Follow this account to see its posts.
      </div>
    `;

  overlay.innerHTML = `
    <div class="public-profile-card">

      <div class="public-profile-cover">
        ${cover}

        <button class="public-profile-close"
                type="button">×</button>
      </div>

      <div class="public-profile-body">

        <div class="public-profile-top">

          <div class="public-profile-avatar">
            ${getAvatar(user)}
          </div>

          <div class="public-profile-actions">

            <button
              type="button"
              id="publicFollowBtn"
              class="public-follow-btn ${following ? "following" : ""}"
            >
              ${following ? "Following" : pending ? "Requested" : "Follow"}
            </button>

            <button
              type="button"
              class="public-message-btn"
              id="publicMessageBtn"
            >
              Message
            </button>

          </div>

        </div>

        <h2 class="public-profile-name">
          ${escapeHTML(user.display_name || user.username)}
        </h2>

        <p class="public-profile-handle">
          @${escapeHTML(user.username || "")}
        </p>

        <p class="public-profile-bio">
          ${escapeHTML(user.bio || "")}
        </p>

  
        <div class="public-profile-stats">

          <div>
            <strong>${postCount.count || 0}</strong>
            <span>Posts</span>
          </div>

          <button
            type="button"
            class="public-profile-stat-button"
            data-public-follow-list="followers"
            data-user-id="${escapeHTML(userId)}"
          >
            <strong>${followers.count || 0}</strong>
            <span>Followers</span>
          </button>

          <button
            type="button"
            class="public-profile-stat-button"
            data-public-follow-list="following"
            data-user-id="${escapeHTML(userId)}"
          >
            <strong>${followings.count || 0}</strong>
            <span>Following</span>
          </button>

        </div>

        <div class="public-profile-tabs">
          <strong>Posts</strong>
        </div>

        <div class="public-profile-posts">
          ${postGrid}
        </div>

      </div>

    </div>
  `;

  

overlay.onclick = async event => {

  // CLOSE PUBLIC PROFILE

if (
  event.target === overlay ||
  event.target.closest(".public-profile-close")
) {
  overlay.hidden = true;
  overlay.dataset.historyOpen = "";

  if (history.state?.publicProfile) {
    history.back();
  }

  return;
}

  // RETURN FROM FOLLOW LIST

  if (event.target.closest("[data-public-follow-back]")) {
    const viewer = overlay.querySelector(".public-profile-follow-view");
    const body = overlay.querySelector(".public-profile-body");

    viewer?.remove();

    if (body) body.hidden = false;

    return;
  }

  // OPEN FOLLOWERS OR FOLLOWING

  const followButton = event.target.closest("[data-public-follow-list]");

  if (!followButton) return;

  const type = followButton.dataset.publicFollowList;
  const targetUserId = followButton.dataset.userId;

  const body = overlay.querySelector(".public-profile-body");

  if (!body) return;

  if (isPrivate && !following) {
    showToast("Follow this private account to view its lists.");
    return;
  }

  let viewer = overlay.querySelector(".public-profile-follow-view");

  if (!viewer) {
    viewer = document.createElement("div");
    viewer.className = "public-profile-follow-view";
    overlay.querySelector(".public-profile-card").appendChild(viewer);
  }

  body.hidden = true;

  viewer.innerHTML = `
    <div class="public-follow-header">
      <button type="button" data-public-follow-back>
        ← Back
      </button>

      <h3>${type === "followers" ? "Followers" : "Following"}</h3>
    </div>

    <div class="public-follow-list">
      <div class="empty-state">
        <div class="leaka-spinner"></div>
        <h3>Loading...</h3>
      </div>
    </div>
  `;

  const list = viewer.querySelector(".public-follow-list");

  const { data, error } = await db
    .from("follows")
    .select(type === "followers" ? "follower_id" : "following_id")
    .eq(
      type === "followers" ? "following_id" : "follower_id",
      targetUserId
    );

  if (error) {
    showEmpty(list, "!", "Unable to load", error.message);
    return;
  }

  if (!data?.length) {
    showEmpty(
      list,
      "♧",
      type === "followers" ? "No followers yet" : "Not following anyone",
      "There are no accounts to display."
    );
    return;
  }

  const ids = data.map(item =>
    type === "followers" ? item.follower_id : item.following_id
  );

  const { data: users, error: profileError } = await db
    .from("profiles")
    .select("*")
    .in("id", ids);

  if (profileError) {
    showEmpty(list, "!", "Unable to load accounts", profileError.message);
    return;
  }

  list.innerHTML = "";

  for (const account of users || []) {
    const item = document.createElement("button");

    item.type = "button";
    item.className = "request-list-item";
    item.dataset.openProfile = account.id;

    item.innerHTML = `
      <div class="request-avatar">
        ${getAvatar(account)}
      </div>

      <div class="request-info">
        <strong>
          ${escapeHTML(account.display_name || account.username || "User")}
        </strong>

        <small>@${escapeHTML(account.username || "")}</small>
      </div>

      <span class="profile-user-arrow">›</span>
    `;

    list.appendChild(item);
  }
};


  $("publicFollowBtn")?.addEventListener("click", async () => {
    await toggleFollow(user);
    overlay.hidden = true;
    await openPublicProfile(userId);
  });

  
$("publicMessageBtn")?.addEventListener("click", () => {
  selectedMessageUser = user;

  overlay.hidden = true;
overlay.dataset.historyOpen = "";

openPrivateChat(user);
});

}


/* =========================================================
   19. FOLLOW / UNFOLLOW
========================================================= */

async function toggleFollow(user) {
  const userId = user.id;

  const { data: existing } = await db
    .from("follows")
    .select("*")
    .eq("follower_id", currentUser.id)
    .eq("following_id", userId)
    .maybeSingle();

  if (existing) {
    const { error } = await db
      .from("follows")
      .delete()
      .eq("follower_id", currentUser.id)
      .eq("following_id", userId);

    if (error) {
      showToast(error.message);
      return;
    }

    showToast("Unfollowed.");
    return;
  }

  if (user.is_private) {
    const { data: request } = await db
      .from("follow_requests")
      .select("id")
      .eq("requester_id", currentUser.id)
      .eq("receiver_id", userId)
      .eq("status", "pending")
      .maybeSingle();

    if (request) {
      showToast("Follow request already sent.");
      return;
    }

    const { error } = await db
      .from("follow_requests")
      .insert({
        requester_id: currentUser.id,
        receiver_id: userId,
        status: "pending"
      });

    if (error) {
      showToast(error.message);
      return;
    }

    showToast("Follow request sent!");
  } else {
    const { error } = await db
      .from("follows")
      .insert({
        follower_id: currentUser.id,
        following_id: userId
      });

    if (error) {
      showToast(error.message);
      return;
    }

    await createNotification(
      userId,
      "follow",
      "started following you"
    );

    showToast("You are now following this user!");
  }

  await loadMyProfilePage();
}


/* =========================================================
   20. FOLLOW REQUESTS
========================================================= */


async function loadFollowRequests() {
  const container =
    $("receivedRequestsList") || $("followRequestsList");

  if (!container || !currentUser) return;

  container.innerHTML = `
    <div class="loading-state">
      <div class="leaka-spinner"></div>
      <p>Loading requests...</p>
    </div>
  `;

  const { data: requests, error } = await db
    .from("follow_requests")
    .select("*")
    .eq("receiver_id", currentUser.id)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error) {
    showEmpty(container, "!", "Requests unavailable", error.message);
    return;
  }

  container.innerHTML = "";

  if (!requests?.length) {
    showEmpty(
      container,
      "♧",
      "No requests yet",
      "New follow requests will appear here."
    );
    return;
  }

  for (const request of requests) {
    const { data: user } = await db
      .from("profiles")
      .select("*")
      .eq("id", request.requester_id)
      .maybeSingle();

    if (!user) continue;

    const item = document.createElement("div");
    item.className = "request-list-item";

    item.innerHTML = `
      <div class="request-avatar">
        ${getAvatar(user)}
      </div>

      <div class="request-info">
        <strong>${escapeHTML(user.display_name || user.username)}</strong>
        <small>@${escapeHTML(user.username || "")}</small>
      </div>

      <button data-accept-request="${escapeHTML(request.id)}">
        Accept
      </button>

      <button
        class="danger"
        data-decline-request="${escapeHTML(request.id)}"
      >
        Decline
      </button>
    `;

    container.appendChild(item);
  }

  if (!container.children.length) {
    showEmpty(
      container,
      "♧",
      "No requests yet",
      "New follow requests will appear here."
    );
  }
}

async function respondToFollowRequest(requestId, accepted) {
  const { data: request, error: findError } = await db
    .from("follow_requests")
    .select("*")
    .eq("id", requestId)
    .eq("receiver_id", currentUser.id)
    .maybeSingle();

  if (findError || !request) {
    showToast("Request not found.");
    return;
  }

  if (accepted) {
    const { error: followError } = await db
      .from("follows")
      .insert({
        follower_id: request.requester_id,
        following_id: currentUser.id
      });

    if (followError) {
      showToast(followError.message);
      return;
    }

    await createNotification(
      request.requester_id,
      "follow_accepted",
      "accepted your follow request"
    );
  }

  const { error } = await db
    .from("follow_requests")
    .update({
      status: accepted ? "accepted" : "declined"
    })
    .eq("id", requestId);

  if (error) {
    showToast(error.message);
    return;
  }

  showToast(accepted ? "Request accepted!" : "Request declined.");

  await loadFollowRequests();
  await loadMyProfilePage();
}


/* =========================================================
   21. NOTIFICATIONS
========================================================= */

async function createNotification(userId, type, message) {
  if (!userId || userId === currentUser.id) return;

  const { error } = await db
    .from("notifications")
    .insert({
      user_id: userId,
      actor_id: currentUser.id,
      type,
      message,
      is_read: false
    });

  if (error) {
    console.error("Notification:", error);
  }
}

async function loadNotifications() {
  const container = $("notificationsList");

  if (!container || !currentUser) return;

  const { data, error } = await db
    .from("notifications")
    .select("*")
    .eq("user_id", currentUser.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    showEmpty(container, "!", "Notifications unavailable", error.message);
    return;
  }

  const notifications = data || [];

  const unread = notifications.filter(item => !item.is_read).length;

  const badge = $("notificationBadge");

  if (badge) {
    badge.hidden = unread === 0;
    badge.textContent = unread > 99 ? "99+" : unread;
  }

  if (!notifications.length) {
    showEmpty(
      container,
      "♡",
      "Nothing here yet",
      "Your activity will appear here."
    );

    return;
  }

  container.innerHTML = "";

  for (const notification of notifications) {
    const { data: actor } = await db
      .from("profiles")
      .select("*")
      .eq("id", notification.actor_id)
      .maybeSingle();

    const item = document.createElement("div");

    item.className =
      "notification-item" +
      (!notification.is_read ? " unread" : "");

    item.innerHTML = `
      <div class="notification-avatar">
        ${actor ? getAvatar(actor) : "♡"}
      </div>

      <div class="notification-content">

        <p>
          <strong>
            ${escapeHTML(actor?.display_name || actor?.username || "LEAKA")}
          </strong>

          ${escapeHTML(notification.message || notification.type || "interacted with you")}
        </p>

        <small>${formatTime(notification.created_at)}</small>

      </div>
    `;

    item.addEventListener("click", async () => {
      if (!notification.is_read) {
        await db
          .from("notifications")
          .update({ is_read: true })
          .eq("id", notification.id);
      }

      if (actor) {
        openPublicProfile(actor.id);
      }

      loadNotifications();
    });

    container.appendChild(item);
  }
}

async function markAllNotificationsRead() {
  const { error } = await db
    .from("notifications")
    .update({ is_read: true })
    .eq("user_id", currentUser.id)
    .eq("is_read", false);

  if (error) {
    showToast(error.message);
    return;
  }

  showToast("All notifications marked as read.");

  await loadNotifications();
}


/* =========================================================
   22. SETTINGS
========================================================= */

async function loadSettings() {
  if (!currentProfile) return;

  $("accountEmail").textContent =
    currentUser.email || "Not available";

  $("accountDisplayName").textContent =
    currentProfile.display_name || currentProfile.username || "";

  $("privateAccount").checked =
    !!currentProfile.is_private;
}

function initializeSettings() {
  $("privateAccount")?.addEventListener("change", async event => {
    const isPrivate = event.target.checked;

    const { error } = await db
      .from("profiles")
      .update({
        is_private: isPrivate
      })
      .eq("id", currentUser.id);

    if (error) {
      event.target.checked = !isPrivate;
      showToast(error.message);
      return;
    }

    currentProfile.is_private = isPrivate;

    showToast(
      isPrivate
        ? "Your account is now private."
        : "Your account is now public."
    );
  });

  $("markAllRead")?.addEventListener(
    "click",
    markAllNotificationsRead
  );
}


/* =========================================================
   23. STORIES — LOAD STORIES
========================================================= */

async function loadStories() {
  const container = $("storiesContainer");

  if (!container || !currentUser) return;

  const { data: stories, error } = await db
    .from("stories")
    .select("*")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Stories:", error);
    return;
  }

  const grouped = new Map();

  for (const story of stories || []) {
    const { data: owner } = await db
      .from("profiles")
      .select("*")
      .eq("id", story.user_id)
      .maybeSingle();

    if (!owner) continue;

    if (
      owner.is_private &&
      owner.id !== currentUser.id
    ) {
      const { data: follow } = await db
        .from("follows")
        .select("follower_id")
        .eq("follower_id", currentUser.id)
        .eq("following_id", owner.id)
        .maybeSingle();

      if (!follow) continue;
    }

    if (!grouped.has(owner.id)) {
      grouped.set(owner.id, {
        owner,
        stories: []
      });
    }

    grouped.get(owner.id).stories.push(story);
  }

  container.innerHTML = "";

  const ownStory = grouped.get(currentUser.id);

  const createButton = document.createElement("button");

  createButton.type = "button";
  createButton.className = "story-create-button";
  createButton.id = "createStoryBtn";

  createButton.innerHTML = `
    <span class="story-ring">
      <span class="story-avatar">+</span>
    </span>
    <small>Your Story</small>
  `;

  createButton.addEventListener("click", () => {
    $("storyInput").click();
  });

  container.appendChild(createButton);

  const otherGroups = Array.from(grouped.values())
    .filter(group => group.owner.id !== currentUser.id);

  if (ownStory) {
    const ownButton = createStoryButton(ownStory);
    container.appendChild(ownButton);
  }

  otherGroups.forEach(group => {
    container.appendChild(createStoryButton(group));
  });
}

function createStoryButton(group) {
  const button = document.createElement("button");

  button.type = "button";
  button.className = "story-item";

  button.innerHTML = `
    <span class="story-ring">
      <span class="story-avatar">
        ${getAvatar(group.owner)}
      </span>
    </span>

    <small>
      ${escapeHTML(
        group.owner.id === currentUser.id
          ? "Your Story"
          : group.owner.display_name || group.owner.username
      )}
    </small>
  `;

  button.addEventListener("click", () => {
    openStoryViewer(group);
  });

  return button;
}


/* =========================================================
   24. CREATE STORIES
========================================================= */

function initializeStoryCreation() {
  $("storyInput")?.addEventListener("change", async event => {
    const file = event.target.files?.[0];

    if (!file) return;

    if (
      !file.type.startsWith("image/") &&
      !file.type.startsWith("video/")
    ) {
      showToast("Choose a photo or video.");
      return;
    }

    const url = await uploadFile(file, "stories");

    if (!url) return;

    const expires = new Date(
      Date.now() + 24 * 60 * 60 * 1000
    ).toISOString();

    const { error } = await db
      .from("stories")
      .insert({
        user_id: currentUser.id,
        media_url: url,
        media_type: file.type.startsWith("video/")
          ? "video"
          : "image",
        expires_at: expires
      });

    event.target.value = "";

    if (error) {
      showToast("Story failed: " + error.message);
      return;
    }

    showToast("Your story is live!");

    await loadStories();
  });
}


/* =========================================================
   25. STORY VIEWER
========================================================= */

function ensureStoryViewer() {
  let viewer = $("storyViewer");

  if (viewer) return viewer;

  viewer = document.createElement("div");

  viewer.id = "storyViewer";
  viewer.hidden = true;

  viewer.innerHTML = `
    <div class="story-viewer-top">

      <div class="story-progress-list"
           id="storyProgressList"></div>

      <div class="story-viewer-user"
           id="storyViewerUser"></div>

    </div>

    <button
      type="button"
      class="story-close"
      id="storyClose"
    >
      ×
    </button>

    <div class="story-viewer-content"
         id="storyViewerContent"></div>

    <div class="story-tap-left"
         id="storyTapLeft"></div>

    <div class="story-tap-right"
         id="storyTapRight"></div>

    <div class="story-pause-indicator"
         id="storyPauseIndicator">
      Ⅱ
    </div>

    <div class="story-reply-area"
         id="storyReplyArea">

      <div class="story-reactions">

        <button data-story-reaction="❤️">❤️</button>
        <button data-story-reaction="😂">😂</button>
        <button data-story-reaction="🔥">🔥</button>
        <button data-story-reaction="😍">😍</button>

      </div>

      <input
        class="story-reply-input"
        id="storyReplyInput"
        placeholder="Reply to story..."
        maxlength="500"
      >

      <button
        type="button"
        id="storyReplySend"
      >
        ➤
      </button>

    </div>

  `;

  document.body.appendChild(viewer);

  $("storyClose").addEventListener("click", closeStoryViewer);

  $("storyTapLeft").addEventListener("click", previousStory);
  $("storyTapRight").addEventListener("click", nextStory);

  $("storyProgressList").addEventListener("click", event => {
    if (event.target.closest(".story-progress")) {
      const segments = [
        ...$("storyProgressList").children
      ];

      const index = segments.indexOf(
        event.target.closest(".story-progress")
      );

      if (index !== -1) {
        currentStoryIndex = index;
        displayCurrentStory();
      }
    }
  });

  $("storyViewerContent").addEventListener("dblclick", () => {
    pauseStory();
  });

  $("storyReplySend").addEventListener("click", () => {
    sendStoryReply();
  });

  $("storyReplyInput").addEventListener("keydown", event => {
    if (event.key === "Enter") sendStoryReply();
  });

  viewer.addEventListener("touchstart", event => {
    storyTouchStartX = event.changedTouches[0].screenX;
  }, { passive: true });

  viewer.addEventListener("touchend", event => {
    const difference =
      event.changedTouches[0].screenX - storyTouchStartX;

    if (Math.abs(difference) > 60) {
      difference > 0 ? previousStory() : nextStory();
    }
  }, { passive: true });

  viewer.querySelectorAll("[data-story-reaction]").forEach(button => {
    button.addEventListener("click", () => {
      const input = $("storyReplyInput");

      input.value += button.dataset.storyReaction;
      input.focus();
    });
  });

  return viewer;
}

function openStoryViewer(group) {
  ensureStoryViewer();

  currentStoryGroup = group.stories;
  currentStoryIndex = 0;

  $("storyViewer").hidden = false;

  document.body.style.overflow = "hidden";

  $("storyProgressList").innerHTML =
    currentStoryGroup.map(() => `
      <div class="story-progress">
        <div class="story-progress-fill"></div>
      </div>
    `).join("");

  displayCurrentStory();
}

function displayCurrentStory() {
  clearInterval(storyTimer);

  storyPaused = false;

  const story = currentStoryGroup[currentStoryIndex];

  if (!story) {
    closeStoryViewer();
    return;
  }

  db.from("profiles")
    .select("*")
    .eq("id", story.user_id)
    .maybeSingle()
    .then(({ data: owner }) => {
      if (!owner || $("storyViewer").hidden) return;

      $("storyViewerUser").innerHTML = `
        <img src="${escapeHTML(owner.avatar_url || "")}" alt="">
        <span>${escapeHTML(owner.display_name || owner.username)}</span>
        <small> · ${formatTime(story.created_at)}</small>
      `;
    });

  const content = $("storyViewerContent");

  content.innerHTML = story.media_type === "video"
    ? `<video src="${escapeHTML(story.media_url)}" autoplay playsinline></video>`
    : `<img src="${escapeHTML(story.media_url)}" alt="Story">`;

  const fills = document.querySelectorAll(".story-progress-fill");

  fills.forEach((fill, index) => {
    fill.style.width = index < currentStoryIndex ? "100%" : "0%";
  });

  const duration = story.media_type === "video" ? 15000 : 5000;

  let elapsed = 0;

  storyTimer = setInterval(() => {
    if (storyPaused) return;

    elapsed += 100;

    const progress = Math.min(100, elapsed / duration * 100);

    const fill = fills[currentStoryIndex];

    if (fill) fill.style.width = progress + "%";

    if (elapsed >= duration) {
      nextStory();
    }
  }, 100);
}

function nextStory() {
  if (currentStoryIndex < currentStoryGroup.length - 1) {
    currentStoryIndex++;
    displayCurrentStory();
  } else {
    closeStoryViewer();
  }
}

function previousStory() {
  if (currentStoryIndex > 0) {
    currentStoryIndex--;
    displayCurrentStory();
  } else {
    closeStoryViewer();
  }
}

function pauseStory() {
  storyPaused = !storyPaused;

  $("storyPauseIndicator").style.display =
    storyPaused ? "block" : "none";
}

function closeStoryViewer() {
  clearInterval(storyTimer);

  const viewer = $("storyViewer");

  if (viewer) {
    viewer.hidden = true;

    $("storyViewerContent").innerHTML = "";
  }

  document.body.style.overflow = "";
  storyPaused = false;
}


/* =========================================================
   26. STORY REPLIES
========================================================= */

async function sendStoryReply() {
  const input = $("storyReplyInput");

  const message = input?.value.trim();

  if (!message) return;

  const story = currentStoryGroup[currentStoryIndex];

  if (!story) return;

  await createNotification(
    story.user_id,
    "story_reply",
    "replied to your story: " + message
  );

  input.value = "";

  showToast("Story reply sent!");
}



function openComments(postId) {
  
const card = document
  .querySelector(`[data-like-post="${postId}"]`)
  ?.closest(".post-card");


  if (!card) return;

  let overlay = $("leakaCommentsOverlay");

  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "leakaCommentsOverlay";
    document.body.appendChild(overlay);
  }

  overlay.dataset.postId = postId;

  const video = card.querySelector("video");

  commentVideoToResume =
    video && !video.paused ? video : null;

  if (video && !video.paused) {
    video.pause();
  }

  const comments = card.querySelector(".comments");

  const commentButton = card.querySelector("[data-focus-comment]");

  const count = Number(
    commentButton?.textContent.match(/\d+/)?.[0] || 0
  );

  overlay.innerHTML = `
    <div class="leaka-comments-sheet">

      <div class="leaka-comments-header">
        <h3>Comments (${count})</h3>

        <button
          type="button"
          class="leaka-comments-close"
          id="closeLeakaComments"
        >×</button>
      </div>

      <div
        class="leaka-comments-list"
        id="activeCommentsList"
        data-post-id="${escapeHTML(postId)}"
      >
        ${comments?.innerHTML || ""}
      </div>

      <div class="leaka-comments-input-area">

        <input
          type="text"
          id="activeCommentInput"
          placeholder="Write a comment..."
          maxlength="1000"
        >

        <button
          type="button"
          id="activeCommentSend"
        >➤</button>

      </div>

    </div>
  `;
if (!overlay.dataset.historyOpen) {
  history.pushState(
    { publicProfile: true },
    "",
    "#public-profile"
  );

  overlay.dataset.historyOpen = "true";
}
  overlay.hidden = false;
  document.body.style.overflow = "hidden";

  overlay.onclick = function(event) {

  const closeButton = event.target.closest(
    "#closeLeakaComments"
  );

  if (closeButton) {
    event.preventDefault();
    event.stopPropagation();
    closeComments();
    return;
  }

  if (event.target === overlay) {
    closeComments();
  }

};

  $("activeCommentSend").addEventListener("click", () => {
    submitComment(postId);
  });

  $("activeCommentInput").addEventListener("keydown", event => {
    if (event.key === "Enter") {
      event.preventDefault();
      submitComment(postId);
    }
  });

  $("activeCommentInput").focus();
}


/* =========================================================
   27. GLOBAL CLICK HANDLERS
========================================================= */


function initializeGlobalEvents() {

  document.addEventListener("click", async event => {

    const likeButton = event.target.closest("[data-like-post]");

    if (likeButton) {
      await toggleLike(likeButton.dataset.likePost);
      return;
    }

    const commentButton = event.target.closest("[data-submit-comment]");

    if (commentButton) {
      await submitComment(commentButton.dataset.submitComment);
      return;
    }

    const focusComment = event.target.closest("[data-focus-comment]");

    if (focusComment) {
      openComments(focusComment.dataset.focusComment);
      return;
    }

    const deleteButton = event.target.closest("[data-delete-post]");

    if (deleteButton) {
      await deletePost(deleteButton.dataset.deletePost);
      return;
    }

    // UNFOLLOW USER
    const unfollowButton = event.target.closest("[data-unfollow]");

    if (unfollowButton) {
      const userId = unfollowButton.dataset.unfollow;

      if (!confirm("Are you sure you want to unfollow this user?")) {
        return;
      }

      unfollowButton.disabled = true;

      const { error } = await db
        .from("follows")
        .delete()
        .eq("follower_id", currentUser.id)
        .eq("following_id", userId);

      if (error) {
        showToast(error.message);
        unfollowButton.disabled = false;
        return;
      }

      showToast("Unfollowed successfully.");

      await loadFollowManagement("following");
      await loadMyProfilePage();
      return;
    }

    const acceptButton = event.target.closest("[data-accept-request]");

    if (acceptButton) {
      await respondToFollowRequest(
        acceptButton.dataset.acceptRequest,
        true
      );
      return;
    }

    const declineButton = event.target.closest("[data-decline-request]");

    if (declineButton) {
      await respondToFollowRequest(
        declineButton.dataset.declineRequest,
        false
      );
      return;
    }

    const profileButton = event.target.closest("[data-open-profile]");

    if (profileButton) {
      openPublicProfile(profileButton.dataset.openProfile);
      return;
    }

    const commentLike = event.target.closest("[data-like-comment]");

    if (commentLike) {
      await toggleCommentLike(commentLike.dataset.likeComment);
      return;
    }

    // SHOW OR HIDE REPLIES
    const toggleReplies = event.target.closest("[data-toggle-replies]");

    if (toggleReplies) {
      const comment = toggleReplies.closest(".leaka-comment");
      const replies = comment?.querySelector(
        ":scope > .leaka-comment-content > .comment-replies"
      );

      if (replies) {
        replies.hidden = !replies.hidden;

        toggleReplies.textContent = replies.hidden
          ? `View replies (${toggleReplies.dataset.replyCount})`
          : "Hide replies";
      }

      return;
    }

    // USE MAIN COMMENT BOX TO REPLY
    const replyButton = event.target.closest("[data-reply-comment]");

    if (replyButton) {
      const comment = replyButton.closest(".leaka-comment");
      const postCard = replyButton.closest(".post-card");

      const postId =
        postCard?.querySelector("[data-submit-comment]")?.dataset.submitComment ||
        $("activeCommentsList")?.dataset.postId;

      if (!comment || !postId) return;

      const input =
        $("activeCommentInput") ||
        $("comment-input-" + postId);

      if (!input) {
        showToast("Comment box unavailable. Open the comments first.");
        return;
      }

      input.dataset.replyTo = comment.dataset.commentId;
      input.placeholder = "Replying to a comment...";
      input.focus();

      return;
    }

  });

  $("profilePosts")?.addEventListener("click", event => {

    const post = event.target.closest("[data-open-post]");

    if (!post) return;

    showToast("Open this post from your feed to interact with it.");

  });

  document.addEventListener("keydown", event => {

    if ($("storyViewer") && !$("storyViewer").hidden) {

      if (event.key === "Escape") closeStoryViewer();

      if (event.key === "ArrowRight") nextStory();

      if (event.key === "ArrowLeft") previousStory();

    }

    if (
      $("leakaCommentsOverlay") &&
      !$("leakaCommentsOverlay").hidden &&
      event.key === "Escape"
    ) {
      closeComments();
    }

  });

}



/* =========================================================
   28. START APPLICATION
========================================================= */

async function startLeaka() {
  initializeAuthentication();
  initializeNavigation();
  initializeActivityTabs();
  initializePostPreview();
  initializeProfileEditor();
  initializeProfileTabs();
  initializeSearch();
  initializeStoryCreation();
  initializeSettings();
  initializeGlobalEvents();

  await checkSession();
}


/* =========================================================
   29. STARTUP
========================================================= */

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", startLeaka);
} else {
  startLeaka();
}

function closeComments() {
  const overlay = document.getElementById("leakaCommentsOverlay");

  if (!overlay) return;

  overlay.hidden = true;

  document.body.style.overflow = "";

  if (commentVideoToResume) {
    commentVideoToResume.play().catch(() => {});
    commentVideoToResume = null;
  }
}

function initializeActivityTabs() {

  document.querySelectorAll("[data-activity-tab]").forEach(button => {

    button.addEventListener("click", () => {

      const target = button.dataset.activityTab;

      document.querySelectorAll("[data-activity-tab]").forEach(tab => {
        tab.classList.toggle("active", tab === button);
      });

      $("activityNotifications").hidden = target !== "notifications";
      $("activityFollows").hidden = target !== "follows";

      if (target === "follows") {
        loadFollowManagement("received");
      }

    });

  });

  document.querySelectorAll("[data-follow-view]").forEach(button => {

    button.addEventListener("click", () => {

      const target = button.dataset.followView;

      document.querySelectorAll("[data-follow-view]").forEach(tab => {
        tab.classList.toggle("active", tab === button);
      });

      document.querySelectorAll("[data-follow-list]").forEach(list => {
        list.hidden = list.dataset.followList !== target;
      });

      loadFollowManagement(target);

    });

  });

}

async function loadFollowManagement(type) {
  if (!currentUser) return;

  const containers = {
    followers: $("followersList"),
    following: $("followingList"),
    received: $("receivedRequestsList"),
    sent: $("sentRequestsList")
  };

  const container = containers[type];

  if (!container) return;

  container.innerHTML = `
    <div class="empty-state">
      <div class="leaka-spinner"></div>
      <h3>Loading...</h3>
    </div>
  `;

  if (type === "received") {
    await loadFollowRequests();

    const oldContainer = $("followRequestsList");

    if (oldContainer && oldContainer.children.length) {
      container.innerHTML = oldContainer.innerHTML;
    }

    return;
  }

  let query;

  if (type === "followers") {
    query = db.from("follows")
      .select("follower_id")
      .eq("following_id", currentUser.id);
  }

  if (type === "following") {
    query = db.from("follows")
      .select("following_id")
      .eq("follower_id", currentUser.id);
  }

  if (type === "sent") {
    query = db.from("follow_requests")
      .select("receiver_id, status, created_at")
      .eq("requester_id", currentUser.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false });
  }

  const { data, error } = await query;

  if (error) {
    showEmpty(container, "!", "Unable to load", error.message);
    return;
  }

  if (!data?.length) {
    const messages = {
      followers: ["No followers yet", "People who follow you will appear here."],
      following: ["Not following anyone", "People you follow will appear here."],
      sent: ["No sent requests", "Follow requests you send will appear here."]
    };

    showEmpty(container, "♧", messages[type][0], messages[type][1]);
    return;
  }

  container.innerHTML = "";

  const ids = data.map(item =>
    type === "followers"
      ? item.follower_id
      : type === "following"
        ? item.following_id
        : item.receiver_id
  );

  const { data: users, error: profileError } = await db
    .from("profiles")
    .select("*")
    .in("id", ids);

  if (profileError) {
    showEmpty(container, "!", "Unable to load users", profileError.message);
    return;
  }

  for (const user of users || []) {
    const item = document.createElement("div");
    item.className = "request-list-item";

    item.innerHTML = `
      <div class="request-avatar">
        ${getAvatar(user)}
      </div>

      <div class="request-info">
        <strong>${escapeHTML(user.display_name || user.username || "User")}</strong>
        <small>@${escapeHTML(user.username || "")}</small>
      </div>

      ${
        type === "following"
          ? `<button class="danger" data-unfollow="${escapeHTML(user.id)}">Unfollow</button>`
          : type === "sent"
            ? `<span class="request-status">Pending</span>`
            : ""
      }
    `;

    container.appendChild(item);
  }
}


window.addEventListener("popstate", event => {
  const overlay = $("publicProfileOverlay");

  if (overlay && !overlay.hidden) {
    overlay.hidden = true;
    overlay.dataset.historyOpen = "";
  }

  const page = event.state?.page || currentPage || "home";

  navigateTo(page, false);
});


/* ================= MESSAGE HELPERS ================= */

async function getMessageProfiles(ids) {
  const uniqueIds = [...new Set(ids)].filter(Boolean);

  if (!uniqueIds.length) return {};

  const { data, error } = await db
    .from("profiles")
    .select("*")
    .in("id", uniqueIds);

  if (error) throw error;

  return Object.fromEntries(
    (data || []).map(user => [user.id, user])
  );
}



function renderMessageUser(user, preview, action = "", message = null, unreadCount = 0) {
  const item = document.createElement("button");

  item.type = "button";
  item.className = "request-list-item message-user-card";

  if (action === "chat") {
    item.dataset.openChat = user.id;
  }

  const time = message?.created_at
    ? new Date(message.created_at).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit"
      })
    : "";

  item.innerHTML = `
    <div class="request-avatar">
      ${getAvatar(user)}
    </div>

    <div class="request-info">
      <strong>${escapeHTML(user.display_name || user.username || "User")}</strong>
      <small>${escapeHTML(preview || "Start a conversation")}</small>
    </div>

    <div class="message-chat-meta">
      <small>${time}</small>

      ${unreadCount > 0 ? `
        <span class="unread-chat-badge">
          ${unreadCount}
        </span>
      ` : ""}
    </div>
  `;

  return item;
}


function renderMessageRequest(request, user, type) {
  const item = document.createElement("div");

  item.className = "request-list-item message-request-card";

  item.innerHTML = `
    <div class="request-avatar">
      ${getAvatar(user)}
    </div>

    <div class="request-info">
      <strong>${escapeHTML(user.display_name || user.username || "User")}</strong>
      <small>@${escapeHTML(user.username || "")}</small>
      <small>${type === "incoming" ? "Wants to message you" : "Waiting for approval"}</small>
    </div>

    ${
      type === "incoming"
        ? `
          <button type="button"
            data-accept-message-request="${escapeHTML(request.id)}">
            Accept
          </button>

          <button type="button"
            class="danger"
            data-decline-message-request="${escapeHTML(request.id)}">
            Decline
          </button>
        `
        : `<small>Pending</small>`
    }
  `;

  return item;
}



/* ================= LOAD LEAKA MESSAGES ================= */

async function loadMessages() {
  const chats = $("conversationsList");
  const incoming = $("incomingMessageRequests");
  const sent = $("sentMessageRequests");

  if (!chats || !incoming || !sent || !currentUser) return;

  chats.innerHTML = "<p>Loading conversations...</p>";
  incoming.innerHTML = "<p>Loading requests...</p>";
  sent.innerHTML = "<p>Loading sent requests...</p>";

  try {
    const [messagesResult, requestsResult, followsResult] =
      await Promise.all([
        db.from("messages")
          .select("*")
          .or(`sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`)
          .order("created_at", { ascending: false }),

        db.from("message_requests")
          .select("*")
          .or(`sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`)
          .order("created_at", { ascending: false }),

        db.from("follows")
          .select("follower_id,following_id")
          .or(`follower_id.eq.${currentUser.id},following_id.eq.${currentUser.id}`)
      ]);

    if (messagesResult.error) throw messagesResult.error;
    if (requestsResult.error) throw requestsResult.error;
    if (followsResult.error) throw followsResult.error;

    const messages = messagesResult.data || [];
    const requests = requestsResult.data || [];
    const follows = followsResult.data || [];

    const pendingIncoming = requests.filter(r =>
      r.receiver_id === currentUser.id && r.status === "pending"
    );

    const pendingSent = requests.filter(r =>
      r.sender_id === currentUser.id && r.status === "pending"
    );

    const acceptedRequests = requests.filter(r =>
      r.status === "accepted"
    );

    const incomingIds = pendingIncoming.map(r => r.sender_id);
    const sentIds = pendingSent.map(r => r.receiver_id);

    const otherIds = [
      ...new Set(messages.map(m =>
        m.sender_id === currentUser.id
          ? m.receiver_id
          : m.sender_id
      ))
    ];

    const profiles = await getMessageProfiles([
      ...incomingIds,
      ...sentIds,
      ...otherIds
    ]);

    // Build mutual-follow pairs
    const following = new Set(
      follows
        .filter(f => f.follower_id === currentUser.id)
        .map(f => f.following_id)
    );

    const followers = new Set(
      follows
        .filter(f => f.following_id === currentUser.id)
        .map(f => f.follower_id)
    );

    const acceptedIds = new Set(
      acceptedRequests.map(r =>
        r.sender_id === currentUser.id
          ? r.receiver_id
          : r.sender_id
      )
    );

    // Incoming requests
    incoming.innerHTML = "";

    if (!pendingIncoming.length) {
      showEmpty(incoming, "♧", "No requests yet",
        "New message requests will appear here.");
    } else {
      for (const request of pendingIncoming) {
        const user = profiles[request.sender_id];
        if (user) {
          incoming.appendChild(
            renderMessageRequest(request, user, "incoming")
          );
        }
      }
    }

    // Sent requests
    sent.innerHTML = "";

    if (!pendingSent.length) {
      showEmpty(sent, "♧", "No sent requests",
        "Message requests you send will appear here.");
    } else {
      for (const request of pendingSent) {
        const user = profiles[request.receiver_id];
        if (user) {
          sent.appendChild(
            renderMessageRequest(request, user, "sent")
          );
        }
      }
    }

    // Build one conversation per person
    const latestByUser = new Map();

    for (const message of messages) {
      const otherId = message.sender_id === currentUser.id
        ? message.receiver_id
        : message.sender_id;

      if (!latestByUser.has(otherId)) {
        latestByUser.set(otherId, message);
      }
    }

    const activeChats = [];

    for (const [otherId, latestMessage] of latestByUser) {
      const mutual =
        following.has(otherId) && followers.has(otherId);

      const accepted = acceptedIds.has(otherId);
      
// Do not show unaccepted message requests as chats.
if (mutual || accepted) {

  const unreadCount = messages.filter(message =>
    message.sender_id === otherId &&
    message.receiver_id === currentUser.id &&
    !message.is_read
  ).length;

  activeChats.push({
    user: profiles[otherId],
    message: latestMessage,
    unreadCount
  });
}
    }

    activeChats.sort((a, b) =>
      new Date(b.message.created_at) -
      new Date(a.message.created_at)
    );

    chats.innerHTML = "";

    if (!activeChats.length) {
      showEmpty(chats, "✉", "No conversations yet",
        "Find someone to message and start a conversation.");
    } else {
      for (const chat of activeChats) {
        if (!chat.user) continue;

        const preview = chat.message.content || "Sent a message";

        chats.appendChild(
  renderMessageUser(
    chat.user,
    preview,
    "chat",
    chat.message,
    chat.unreadCount
  )
);
      }
    }

    // Count unread messages in active chats, plus incoming requests.
    const pendingIncomingSet = new Set(incomingIds);

    const unreadActiveMessages = messages.filter(message => {
      if (message.receiver_id !== currentUser.id || message.is_read) {
        return false;
      }

      return !pendingIncomingSet.has(message.sender_id);
    }).length;

    const totalMessageNotifications =
      pendingIncoming.length + unreadActiveMessages;

    const badge = $("messageBadge");

    if (badge) {
      badge.textContent = totalMessageNotifications > 99
        ? "99+"
        : totalMessageNotifications;

      badge.hidden = totalMessageNotifications === 0;
    }

    // Wire actions once
    if (!incoming.dataset.actionsBound) {
      incoming.dataset.actionsBound = "true";

      incoming.addEventListener("click", async event => {
        const accept = event.target.closest(
          "[data-accept-message-request]"
        );

        const decline = event.target.closest(
          "[data-decline-message-request]"
        );

        const button = accept || decline;
        if (!button) return;

        const requestId = button.dataset.acceptMessageRequest ||
          button.dataset.declineMessageRequest;

        button.disabled = true;

        try {
          const { error } = await db
            .from("message_requests")
            .update({
              status: accept ? "accepted" : "declined"
            })
            .eq("id", requestId)
            .eq("receiver_id", currentUser.id)
            .eq("status", "pending");

          if (error) throw error;

          showToast(
            accept ? "Message request accepted!" : "Request declined."
          );

          await loadMessages();

        } catch (error) {
          console.error("MESSAGE REQUEST ERROR:", error);
          showToast(error.message || "Could not update request.");
          button.disabled = false;
        }
      });
    }

    if (!chats.dataset.actionsBound) {
      chats.dataset.actionsBound = "true";

      chats.addEventListener("click", event => {
        const button = event.target.closest("[data-open-chat]");
        if (!button) return;

        const user = profiles[button.dataset.openChat];

        if (user) openPrivateChat(user);
      });
    }

  } catch (error) {
    console.error("LEAKA messages error:", error);

    chats.innerHTML = "<p>Couldn't load conversations.</p>";
    incoming.innerHTML = "";
    sent.innerHTML = "";

    showToast(error.message || "Couldn't load messages.");
  }
}



})();

/* =====================================================
   LEAKA — COMPLETE UPDATED APP.JS
   Authentication • Profiles • Posts • Likes • Comments
   Search • Following • Private Accounts • Notifications
   Follow Requests • Stories • Supabase Storage
===================================================== */

(() => {
"use strict";

// =====================================================
// CONFIGURATION
// =====================================================

const SUPABASE_URL = "https://kiwpmnvoqzrfwblnudjq.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable__oAt1RpObXR5PDqSG7yE1w_SkdZ0Hry";
const BUCKET = "leaka-media";

const { createClient } = window.supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});

let currentUser = null;
let currentProfile = null;
let selectedMedia = null;
let searchTimer = null;
let activePublicUser = null;
let starting = false;
let authReady = false;

const $ = id => document.getElementById(id);

// =====================================================
// HELPERS
// =====================================================

function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[c]);
}

function profileName(profile) {
  return profile?.display_name ||
    profile?.username ||
    "LEAKA User";
}

function username(profile) {
  return profile?.username || "user";
}

function avatarHTML(url, name = "U") {
  return url
    ? `<img src="${escapeHTML(url)}" alt="Profile picture" loading="lazy">`
    : escapeHTML((name || "U").charAt(0).toUpperCase());
}

function notify(message, error = false) {
  let box = $("leakaToast");

  if (!box) {
    box = document.createElement("div");
    box.id = "leakaToast";
    document.body.appendChild(box);
  }

  box.textContent = message;

  box.style.cssText = `
    position:fixed;
    bottom:95px;
    left:50%;
    transform:translateX(-50%);
    background:${error ? "#963c60" : "#7139bd"};
    color:white;
    padding:13px 22px;
    border-radius:30px;
    z-index:999999;
    box-shadow:0 8px 30px #0005;
    font-size:13px;
    max-width:90%;
    text-align:center;
  `;

  clearTimeout(window.leakaToastTimer);

  window.leakaToastTimer = setTimeout(() => {
    box.remove();
  }, 3000);
}

function localProfile(userId = currentUser?.id) {
  if (!userId) return {};

  try {
    return JSON.parse(
      localStorage.getItem("leaka_profile_" + userId) || "{}"
    );
  } catch {
    return {};
  }
}

function saveLocalProfile(data, userId = currentUser?.id) {
  if (!userId) return;

  localStorage.setItem(
    "leaka_profile_" + userId,
    JSON.stringify(data)
  );
}

function setMessage(id, message) {
  if ($(id)) $(id).textContent = message;
}

function setLoading(button, loading, text) {
  if (!button) return;

  button.disabled = loading;

  if (loading) {
    button.dataset.originalText = button.textContent;
    button.textContent = text || "Please wait...";
  } else {
    button.textContent =
      button.dataset.originalText || button.textContent;
  }
}

function timeAgo(date) {
  const seconds = Math.floor(
    (Date.now() - new Date(date).getTime()) / 1000
  );

  if (seconds < 60) return "Just now";
  if (seconds < 3600) return Math.floor(seconds / 60) + "m ago";
  if (seconds < 86400) return Math.floor(seconds / 3600) + "h ago";
  if (seconds < 604800) return Math.floor(seconds / 86400) + "d ago";

  return new Date(date).toLocaleDateString();
}

// =====================================================
// PROFILES
// =====================================================

async function getProfile(userId) {
  const { data, error } = await db
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw error;

  return data;
}

async function ensureProfile(user) {
  let profile = await getProfile(user.id);

  if (profile) return profile;

  const baseName = (
    user.email?.split("@")[0] || "user"
  ).toLowerCase().replace(/[^a-z0-9_]/g, "");

  const newProfile = {
    id: user.id,
    username: baseName || "user_" + user.id.slice(0, 6),
    display_name: user.email?.split("@")[0] || "LEAKA User",
    bio: "Welcome to my LEAKA space 💜"
  };

  const { error } = await db
    .from("profiles")
    .insert(newProfile);

  if (error) {
    // Another session or trigger may have created it.
    profile = await getProfile(user.id).catch(() => null);
    if (!profile) throw error;
  } else {
    profile = await getProfile(user.id);
  }

  return profile;
}

// =====================================================
// AUTHENTICATION
// =====================================================

async function startApp(user) {
  if (!user || starting) return;

  starting = true;
  currentUser = user;

  try {
    currentProfile = await ensureProfile(user);

    if ($("auth")) $("auth").hidden = true;
    if ($("appContent")) $("appContent").hidden = false;

    await updateMyProfileUI();

    await Promise.allSettled([
      loadPosts(),
      loadSearch(),
      loadNotifications(),
      loadStories(),
      loadAccountDetails(),
      loadPrivacySetting(),
      renderFollowRequests($("followRequestsList"))
    ]);

    authReady = true;

  } catch (error) {
    console.error("LEAKA startup:", error);
    notify("App loading error: " + error.message, true);
  } finally {
    starting = false;
  }
}

async function checkSession() {
  const { data, error } = await db.auth.getSession();

  if (error) {
    notify(error.message, true);
    return;
  }

  if (data.session?.user) {
    await startApp(data.session.user);
  } else {
    currentUser = null;
    currentProfile = null;

    if ($("auth")) $("auth").hidden = false;
    if ($("appContent")) $("appContent").hidden = true;
  }
}

// SIGN UP

$("signupBtn")?.addEventListener("click", async () => {
  const email = $("email")?.value.trim();
  const password = $("password")?.value;

  if (!email || !password) {
    setMessage("authMessage", "Enter your email and password.");
    return;
  }

  if (password.length < 6) {
    setMessage("authMessage", "Password must be at least 6 characters.");
    return;
  }

  const button = $("signupBtn");
  setLoading(button, true, "Creating account...");

  try {
    const { data, error } = await db.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: "https://credos160-ship-it.github.io/Leaka/"
      }
    });

    if (error) throw error;

    if (data.session?.user) {
      await startApp(data.session.user);
    } else {
      setMessage(
        "authMessage",
        "Account created! Check your email to confirm your account."
      );
    }

  } catch (error) {
    setMessage("authMessage", error.message);
  } finally {
    setLoading(button, false);
  }
});

// LOGIN

$("loginBtn")?.addEventListener("click", async () => {
  const email = $("email")?.value.trim();
  const password = $("password")?.value;

  if (!email || !password) {
    setMessage("authMessage", "Enter your email and password.");
    return;
  }

  const button = $("loginBtn");
  setLoading(button, true, "Logging in...");

  try {
    const { data, error } = await db.auth.signInWithPassword({
      email,
      password
    });

    if (error) throw error;

    await startApp(data.user);

    setMessage("authMessage", "");

  } catch (error) {
    setMessage("authMessage", error.message);
  } finally {
    setLoading(button, false);
  }
});

// LOGOUT

async function logout() {
  const { error } = await db.auth.signOut();

  if (error) {
    notify(error.message, true);
    return;
  }

  currentUser = null;
  currentProfile = null;
  authReady = false;

  if ($("auth")) $("auth").hidden = false;
  if ($("appContent")) $("appContent").hidden = true;
}

window.logout = logout;

$("logoutBtn")?.addEventListener("click", logout);
$("settingsLogoutBtn")?.addEventListener("click", logout);

// Listen for authentication changes.
// INITIAL_SESSION is handled by checkSession().

db.auth.onAuthStateChange((event, session) => {
  if (event === "SIGNED_OUT") {
    currentUser = null;
    currentProfile = null;

    if ($("auth")) $("auth").hidden = false;
    if ($("appContent")) $("appContent").hidden = true;
  }

  if (event === "TOKEN_REFRESHED") {
    currentUser = session?.user || currentUser;
  }
});

// =====================================================
// NAVIGATION
// =====================================================

function showPage(pageId) {
  document.querySelectorAll("#appContent main.page")
    .forEach(page => {
      const active = page.id === pageId;

      page.hidden = !active;
      page.classList.toggle("active", active);
    });

  document.querySelectorAll("[data-page]").forEach(button => {
    button.classList.toggle(
      "active",
      button.dataset.page === pageId
    );
  });

  window.scrollTo({ top: 0, behavior: "smooth" });

  if (pageId === "profile") updateMyProfileUI();

  if (pageId === "settings") {
    loadAccountDetails();
    loadPrivacySetting();
    renderFollowRequests($("followRequestsList"));
  }

  if (pageId === "notifications") loadNotifications();
}

window.showPage = showPage;

document.addEventListener("click", event => {
  const button = event.target.closest("[data-page]");
  if (button) showPage(button.dataset.page);
});

$("profileBtn")?.addEventListener("click", () => showPage("profile"));
$("settingsGear")?.addEventListener("click", () => showPage("settings"));

// =====================================================
// STORAGE / MEDIA UPLOAD
// =====================================================

async function uploadMedia(file, folder = "posts") {
  if (!currentUser || !file) return null;

  if (file.size > 25 * 1024 * 1024) {
    notify("Maximum file size is 25MB.", true);
    return null;
  }

  const extension = (
    file.name.split(".").pop() || "bin"
  ).toLowerCase().replace(/[^a-z0-9]/g, "");

  const path =
    `${folder}/${currentUser.id}/${crypto.randomUUID()}.${extension}`;

  const { error } = await db.storage
    .from(BUCKET)
    .upload(path, file, {
      upsert: false,
      contentType: file.type || "application/octet-stream"
    });

  if (error) {
    console.error(error);
    notify("Upload failed: " + error.message, true);
    return null;
  }

  const { data } = db.storage
    .from(BUCKET)
    .getPublicUrl(path);

  return data.publicUrl;
}

// =====================================================
// PROFILE UI
// =====================================================

async function updateMyProfileUI() {
  if (!currentUser) return;

  const profile = currentProfile || {};
  const local = localProfile();

  const name =
    profile.display_name ||
    local.name ||
    currentUser.email?.split("@")[0] ||
    "LEAKA User";

  const avatar = profile.avatar_url || local.avatar || "";
  const cover = local.cover || "";

  if ($("profileName")) $("profileName").textContent = name;

  if ($("profileEmail")) {
    $("profileEmail").textContent = "@" + username(profile);
  }

  if ($("profileBio")) {
    $("profileBio").textContent =
      profile.bio || local.bio || "Welcome to my LEAKA space 💜";
  }

  if ($("profileAvatar")) {
    $("profileAvatar").innerHTML = avatarHTML(avatar, name);
  }

  if ($("editAvatar")) {
    $("editAvatar").innerHTML = avatarHTML(avatar, name);
  }

  if ($("profileBtn")) {
    $("profileBtn").innerHTML = avatarHTML(avatar, name);
  }

  if ($("profileCoverImage")) {
    $("profileCoverImage").hidden = !cover;
    if (cover) $("profileCoverImage").src = cover;
  }

  if ($("displayName")) $("displayName").value = name;
  if ($("bioInput")) $("bioInput").value = profile.bio || local.bio || "";

  if ($("editCoverPreview")) {
    $("editCoverPreview").innerHTML = cover
      ? `<img src="${escapeHTML(cover)}" alt="Cover preview">`
      : "";
  }

  await loadMyPosts();
}

async function loadAccountDetails() {
  if (!currentUser) return;

  if ($("accountEmail")) {
    $("accountEmail").textContent = currentUser.email || "";
  }

  if ($("accountDisplayName")) {
    $("accountDisplayName").textContent =
      currentProfile?.display_name || "Not set";
  }
}

// AVATAR

$("avatarInput")?.addEventListener("change", async event => {
  const file = event.target.files?.[0];
  if (!file || !currentUser) return;

  if (!file.type.startsWith("image/")) {
    notify("Choose an image.", true);
    return;
  }

  const url = await uploadMedia(file, "avatars");
  if (!url) return;

  const { data, error } = await db
    .from("profiles")
    .update({ avatar_url: url })
    .eq("id", currentUser.id)
    .select()
    .single();

  if (error) {
    notify(error.message, true);
    return;
  }

  currentProfile = data;
  await updateMyProfileUI();
  notify("Profile picture updated 💜");
});

// COVER

$("coverInput")?.addEventListener("change", async event => {
  const file = event.target.files?.[0];
  if (!file || !currentUser) return;

  if (!file.type.startsWith("image/")) {
    notify("Choose an image.", true);
    return;
  }

  const url = await uploadMedia(file, "covers");
  if (!url) return;

  const local = localProfile();
  local.cover = url;
  saveLocalProfile(local);

  await updateMyProfileUI();
  notify("Cover photo updated 💜");
});

// PROFILE EDITOR

$("editProfileToggle")?.addEventListener("click", () => {
  const editor = $("profileEditSection");
  const button = $("editProfileToggle");

  if (!editor) return;

  editor.hidden = !editor.hidden;

  button.textContent = editor.hidden
    ? "✏️ Edit Profile"
    : "✕ Close Editor";

  if (!editor.hidden) {
    editor.scrollIntoView({ behavior: "smooth", block: "start" });
  }
});

// SAVE PROFILE

$("saveProfileBtn")?.addEventListener("click", async () => {
  if (!currentUser) return;

  const name = $("displayName")?.value.trim();
  const bio = $("bioInput")?.value.trim();

  if (!name) {
    notify("Enter your display name.", true);
    return;
  }

  const button = $("saveProfileBtn");
  setLoading(button, true, "Saving...");

  try {
    const { data, error } = await db
      .from("profiles")
      .update({
        display_name: name,
        bio
      })
      .eq("id", currentUser.id)
      .select()
      .single();

    if (error) throw error;

    currentProfile = data;

    await updateMyProfileUI();
    await loadAccountDetails();

    notify("Profile updated successfully 💜");

  } catch (error) {
    notify(error.message, true);
  } finally {
    setLoading(button, false);
  }
});

// =====================================================
// CREATE POSTS
// =====================================================

$("mediaInput")?.addEventListener("change", event => {
  selectedMedia = event.target.files?.[0] || null;

  const preview = $("preview");
  if (!preview) return;

  preview.innerHTML = "";

  if (!selectedMedia) return;

  if (selectedMedia.size > 25 * 1024 * 1024) {
    notify("Maximum file size is 25MB.", true);
    event.target.value = "";
    selectedMedia = null;
    return;
  }

  const url = URL.createObjectURL(selectedMedia);

  preview.innerHTML = selectedMedia.type.startsWith("video/")
    ? `<video src="${url}" controls playsinline></video>`
    : `<img src="${url}" alt="Post preview">`;
});

$("postBtn")?.addEventListener("click", async () => {
  if (!currentUser) {
    notify("Please log in first.", true);
    return;
  }

  const caption = $("caption")?.value.trim() || "";

  if (!caption && !selectedMedia) {
    notify("Write something or add a photo/video.", true);
    return;
  }

  const button = $("postBtn");
  setLoading(button, true, "Publishing...");

  try {
    let mediaUrl = null;
    let mediaType = null;

    if (selectedMedia) {
      mediaUrl = await uploadMedia(selectedMedia, "posts");

      if (!mediaUrl) return;

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

    if (error) throw error;

    $("caption").value = "";
    $("mediaInput").value = "";
    $("preview").innerHTML = "";

    selectedMedia = null;

    notify("Your post is live! ✨");

    await Promise.all([loadPosts(), loadMyPosts()]);

  } catch (error) {
    notify(error.message, true);
  } finally {
    setLoading(button, false);
  }
});

// =====================================================
// FEED
// =====================================================


async function loadPosts() {
  const container = $("posts");

  if (!container || !currentUser) return;

  container.innerHTML = `<p class="muted">Loading posts...</p>`;

  const { data, error } = await db
    .from("posts")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("Posts error:", error);
    container.innerHTML = `<p class="muted">Could not load posts.</p>`;
    return;
  }

  if (!data?.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div>✦</div>
        <h3>Your story starts here</h3>
        <p>Be the first to share something.</p>
      </div>`;
    return;
  }

  container.innerHTML = "";

  const profiles = new Map();
  const likesMap = new Map();

  const userIds = [...new Set(data.map(post => post.user_id))];

  const { data: profileData, error: profileError } = await db
    .from("profiles")
    .select("*")
    .in("id", userIds);

  if (profileError) console.error("Profile error:", profileError);

  (profileData || []).forEach(profile => {
    profiles.set(profile.id, profile);
  });

  const postIds = data.map(post => post.id);

  const { data: likes, error: likesError } = await db
    .from("likes")
    .select("post_id,user_id")
    .in("post_id", postIds);

  if (likesError) console.error("Likes error:", likesError);

  (likes || []).forEach(like => {
    if (!likesMap.has(like.post_id)) {
      likesMap.set(like.post_id, []);
    }

    likesMap.get(like.post_id).push(like);
  });

  for (const post of data) {
    const profile = profiles.get(post.user_id);
    const postLikes = likesMap.get(post.id) || [];

    const liked = postLikes.some(
      like => like.user_id === currentUser.id
    );

    const card = document.createElement("article");
    card.className = "post-card";

    card.innerHTML = `
      <div class="post-header">
        <div class="post-avatar">
          ${avatarHTML(profile?.avatar_url, profileName(profile))}
        </div>

        <div>
          <div class="post-user">
            ${escapeHTML(profileName(profile))}
          </div>

          <div class="post-time">
            @${escapeHTML(username(profile))} · ${timeAgo(post.created_at)}
          </div>
        </div>
      </div>

      ${post.caption
        ? `<p class="post-caption">${escapeHTML(post.caption)}</p>`
        : ""}

      ${post.media_url
        ? post.media_type === "video"
          ? `<video class="post-media"
              src="${escapeHTML(post.media_url)}"
              controls playsinline></video>`
          : `<img class="post-media"
              src="${escapeHTML(post.media_url)}"
              alt="Post"
              loading="lazy">`
        : ""}

      <div class="post-actions">

        <button class="action-btn ${liked ? "liked" : ""}"
          data-like="${escapeHTML(post.id)}">
          ${liked ? "♥" : "♡"} ${postLikes.length} Likes
        </button>

        <button class="action-btn"
          data-toggle-comments="${escapeHTML(post.id)}">
          ♧ Comments
        </button>

        ${post.user_id === currentUser.id
          ? `<button class="action-btn"
              data-delete-post="${escapeHTML(post.id)}">
              Delete
            </button>`
          : ""}

      </div>

      <div class="comments-wrapper" hidden>

        <div class="comment-area">
          <input
            id="comment-${escapeHTML(post.id)}"
            placeholder="Write a comment..."
          >

          <button data-comment="${escapeHTML(post.id)}">
            Send
          </button>
        </div>

        <div class="comments"
          id="comments-${escapeHTML(post.id)}">
        </div>

      </div>
    `;

    container.appendChild(card);

    // Comments load only when opened
    const toggleButton = card.querySelector("[data-toggle-comments]");
    const commentsWrapper = card.querySelector(".comments-wrapper");
    const commentInput = card.querySelector(
      `#comment-${CSS.escape(post.id)}`
    );

    let commentsLoaded = false;
    let loadingComments = false;

    toggleButton.addEventListener("click", async () => {

      const opening = commentsWrapper.hidden;

      commentsWrapper.hidden = !opening;

      if (!opening) return;

      if (!commentsLoaded && !loadingComments) {
        loadingComments = true;

        commentsWrapper.querySelector(".comments").innerHTML =
          `<p class="muted">Loading comments...</p>`;

        try {
          await loadComments(post.id);
          commentsLoaded = true;
        } catch (err) {
          console.error("Comment loading error:", err);

          commentsWrapper.querySelector(".comments").innerHTML =
            `<p class="muted">Could not load comments.</p>`;
        } finally {
          loadingComments = false;
        }
      }

      commentInput?.focus();
    });
  }
}

// =========================================
// LEAKA — LIKE SYSTEM
// Like • Unlike • Instant UI update
// =========================================

const processingLikes = new Set();

document.addEventListener("click", async event => {
  const button = event.target.closest("[data-like]");

  if (!button || !currentUser) return;

  const postId = button.dataset.like;

  if (processingLikes.has(postId)) return;

  processingLikes.add(postId);
  button.disabled = true;

  const wasLiked = button.classList.contains("liked");

  try {
    if (wasLiked) {
      const { error } = await db
        .from("likes")
        .delete()
        .eq("post_id", postId)
        .eq("user_id", currentUser.id);

      if (error) throw error;

      button.classList.remove("liked");
      button.textContent = button.textContent.replace("♥", "♡");

    } else {
      const { error } = await db
        .from("likes")
        .insert({
          post_id: postId,
          user_id: currentUser.id
        });

      if (error) throw error;

      button.classList.add("liked");
      button.textContent = button.textContent.replace("♡", "♥");
    }

    const match = button.textContent.match(/\d+/);
    const count = match ? Number(match[0]) : 0;

    button.textContent = button.textContent.replace(
      /\d+/,
      String(wasLiked ? Math.max(0, count - 1) : count + 1)
    );

  } catch (error) {
    console.error("Like error:", error);
    notify("Like failed: " + error.message, true);

  } finally {
    processingLikes.delete(postId);
    button.disabled = false;
  }
});

// =====================================================
// COMMENTS — LEAKA FIXED SYSTEM
// Hidden by default • Single submission • Live refresh
// =====================================================

async function loadComments(postId) {
  const container = $("comments-" + postId);

  if (!container) return;

  container.innerHTML = `
    <p class="muted">Loading comments...</p>
  `;

  const { data, error } = await db
    .from("comments")
    .select("*")
    .eq("post_id", postId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Comments:", error);
    container.textContent = "Comments unavailable.";
    return;
  }

  container.innerHTML = "";

  if (!data || data.length === 0) {
    container.innerHTML = `
      <p class="muted">No comments yet. Be the first! 💜</p>
    `;
    return;
  }

  const userIds = [...new Set(data.map(c => c.user_id))];

  const { data: profiles } = await db
    .from("profiles")
    .select("*")
    .in("id", userIds);

  const profileMap = new Map();

  (profiles || []).forEach(profile => {
    profileMap.set(profile.id, profile);
  });

  data.forEach(comment => {
    const profile = profileMap.get(comment.user_id);

    const item = document.createElement("div");
    item.className = "leaka-comment";

    const author = document.createElement("strong");
    author.textContent = profileName(profile);

    const message = document.createElement("span");
    message.textContent = " " + (
      comment.content || comment.comment || ""
    );

    item.appendChild(author);
    item.appendChild(message);

    container.appendChild(item);
  });
}

// SEND COMMENT — ONE INSERT PER CLICK

document.addEventListener("click", async event => {
  const button = event.target.closest("[data-comment]");

  if (!button || !currentUser) return;

  if (button.dataset.sending === "true") return;

  const postId = button.dataset.comment;
  const input = $("comment-" + postId);
  const content = input?.value.trim();

  if (!content) {
    notify("Write a comment first.", true);
    return;
  }

  button.dataset.sending = "true";
  button.disabled = true;

  try {
    const { error } = await db
      .from("comments")
      .insert({
        post_id: postId,
        user_id: currentUser.id,
        content: content
      });

    if (error) throw error;

    input.value = "";

    await loadComments(postId);

    notify("Comment posted 💜");

  } catch (error) {
    console.error("Comment submission:", error);
    notify("Comment failed: " + error.message, true);

  } finally {
    button.dataset.sending = "false";
    button.disabled = false;
  }
});

// =====================================================
// DELETE POSTS
// =====================================================

document.addEventListener("click", async event => {
  const button = event.target.closest("[data-delete-post]");
  if (!button || !currentUser) return;

  if (!confirm("Are you sure you want to delete this post?")) return;

  button.disabled = true;

  const { error } = await db
    .from("posts")
    .delete()
    .eq("id", button.dataset.deletePost)
    .eq("user_id", currentUser.id);

  if (error) {
    notify(error.message, true);
    button.disabled = false;
    return;
  }

  notify("Post deleted.");

  await Promise.all([loadPosts(), loadMyPosts()]);
});

// =====================================================
// MY PROFILE POSTS AND COUNTS
// =====================================================

async function loadMyPosts() {
  if (!currentUser) return;

  const { data, error } = await db
    .from("posts")
    .select("*")
    .eq("user_id", currentUser.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error(error);
    return;
  }

  const posts = data || [];

  if ($("postCount")) {
    $("postCount").textContent = posts.length;
  }

  const container = $("profilePosts");

  if (container) {
    container.innerHTML = posts.length
      ? posts.map(post => `
          <div class="public-profile-post">
            ${post.media_url
              ? post.media_type === "video"
                ? `<video src="${escapeHTML(post.media_url)}" muted playsinline controls></video>`
                : `<img src="${escapeHTML(post.media_url)}" alt="Post" loading="lazy">`
              : `<div>${escapeHTML(post.caption)}</div>`
            }
          </div>
        `).join("")
      : `
          <div class="empty-state">
            <div>✦</div>
            <h3>Your story starts here</h3>
            <p>Your posts will appear here.</p>
          </div>`;
  }

  await loadMyCounts();
}

async function loadMyCounts() {
  if (!currentUser) return;

  const [followers, following] = await Promise.all([
    db.from("follows")
      .select("*", { count: "exact", head: true })
      .eq("following_id", currentUser.id),

    db.from("follows")
      .select("*", { count: "exact", head: true })
      .eq("follower_id", currentUser.id)
  ]);

  if ($("followerCount")) {
    $("followerCount").textContent = followers.count || 0;
  }

  if ($("followingCount")) {
    $("followingCount").textContent = following.count || 0;
  }
}

// =====================================================
// SEARCH
// =====================================================

async function loadSearch() {
  const input = $("search");
  if (!input || input.dataset.leakaBound) return;

  input.dataset.leakaBound = "true";

  input.addEventListener("input", () => {
    clearTimeout(searchTimer);

    const query = input.value.trim();

    if (query.length < 2) {
      if ($("searchResults")) $("searchResults").innerHTML = "";
      return;
    }

    searchTimer = setTimeout(() => searchUsers(query), 350);
  });
}

async function searchUsers(query) {
  if (!currentUser) return;

  const results = $("searchResults");
  if (!results) return;

  const safeQuery = query.replace(/[,%()]/g, " ");

  const { data, error } = await db
    .from("profiles")
    .select("id,username,display_name,avatar_url,is_private")
    .or(
      `username.ilike.%${safeQuery}%,display_name.ilike.%${safeQuery}%`
    )
    .limit(15);

  if (error) {
    console.error(error);
    return;
  }

  if ($("search")?.value.trim() !== query) return;

  results.innerHTML = "";

  const people = (data || []).filter(
    profile => profile.id !== currentUser.id
  );

  if (!people.length) {
    results.innerHTML = `<div class="empty-state">No people found.</div>`;
    return;
  }

  people.forEach(profile => {
    const item = document.createElement("div");
    item.className = "search-user";

    item.innerHTML = `
      <div class="search-user-avatar">
        ${avatarHTML(profile.avatar_url, profileName(profile))}
      </div>
      <div>
        <strong>${escapeHTML(profileName(profile))}</strong>
        <span>@${escapeHTML(username(profile))}</span>
      </div>
    `;

    item.addEventListener("click", () => {
      results.innerHTML = "";
      $("search")?.blur();
      openPublicProfile(profile.id);
    });

    results.appendChild(item);
  });
}

// =====================================================
// PUBLIC PROFILES
// =====================================================

function createProfileOverlay() {
  let overlay = $("publicProfileOverlay");

  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "publicProfileOverlay";
    overlay.hidden = true;
    document.body.appendChild(overlay);

    overlay.addEventListener("click", event => {
      if (event.target === overlay) closePublicProfile();
    });
  }

  return overlay;
}

function closePublicProfile() {
  const overlay = $("publicProfileOverlay");
  if (overlay) overlay.hidden = true;

  activePublicUser = null;
}

window.closePublicProfile = closePublicProfile;

async function openPublicProfile(userId) {
  if (!currentUser) return;

  if (userId === currentUser.id) {
    showPage("profile");
    return;
  }

  const overlay = createProfileOverlay();
  overlay.hidden = false;

  overlay.innerHTML = `
    <div class="public-profile-card">
      <div class="public-profile-cover">
        <button class="public-profile-close" onclick="closePublicProfile()">×</button>
      </div>
      <div class="public-profile-body">
        <div class="public-profile-loading">
          <div class="leaka-spinner"></div>
          <strong>Loading LEAKA profile...</strong>
          <small>Connecting your world 💜</small>
        </div>
      </div>
    </div>
  `;

  const profile = await getProfile(userId).catch(() => null);

  if (!profile) {
    overlay.innerHTML = `
      <div class="public-profile-card">
        <div class="public-profile-body">
          <button class="public-profile-close" onclick="closePublicProfile()">×</button>
          <p>This profile could not be found.</p>
        </div>
      </div>
    `;
    return;
  }

  activePublicUser = profile;

  const local = localProfile(userId);

  const [followResult, requestResult, followersResult, followingResult] =
    await Promise.all([
      db.from("follows")
        .select("follower_id")
        .eq("follower_id", currentUser.id)
        .eq("following_id", userId)
        .maybeSingle(),

      db.from("follow_requests")
        .select("id,status")
        .eq("requester_id", currentUser.id)
        .eq("receiver_id", userId)
        .eq("status", "pending")
        .maybeSingle(),

      db.from("follows")
        .select("*", { count: "exact", head: true })
        .eq("following_id", userId),

      db.from("follows")
        .select("*", { count: "exact", head: true })
        .eq("follower_id", userId)
    ]);

  if (activePublicUser?.id !== userId) return;

  const isPrivate = profile.is_private === true;
  const isFollowing = !!followResult.data;
  const isPending = !!requestResult.data;
  const canSeePosts = !isPrivate || isFollowing;

  overlay.innerHTML = `
    <div class="public-profile-card">
      <div class="public-profile-cover">
        ${local.cover
          ? `<img src="${escapeHTML(local.cover)}" alt="Cover">`
          : ""}
        <button class="public-profile-close" onclick="closePublicProfile()">×</button>
      </div>

      <div class="public-profile-body">
        <div class="public-profile-top">
          <div class="public-profile-avatar">
            ${avatarHTML(profile.avatar_url, profileName(profile))}
          </div>

          <div class="public-profile-actions">
            <button class="public-follow-btn ${isFollowing ? "following" : ""}"
              id="publicFollowBtn">
              ${isFollowing ? "✓ Following" : isPending ? "Requested" : "Follow"}
            </button>

            <button class="public-message-btn"
              onclick="notify('Messaging is coming soon 💜')">
              Message
            </button>
          </div>
        </div>

        <h2 class="public-profile-name">${escapeHTML(profileName(profile))}</h2>
        <p class="public-profile-handle">@${escapeHTML(username(profile))}</p>
        <p class="public-profile-bio">${escapeHTML(profile.bio || "Living my LEAKA life 💜")}</p>

        <div class="public-profile-stats">
          <div><strong>${canSeePosts ? "..." : "—"}</strong><span>Posts</span></div>
          <div><strong>${followersResult.count || 0}</strong><span>Followers</span></div>
          <div><strong>${followingResult.count || 0}</strong><span>Following</span></div>
        </div>

        ${canSeePosts
          ? `
            <div class="public-profile-tabs">
              <button class="selected">Posts</button>
            </div>
            <div class="public-profile-posts" id="publicProfilePosts">
              <div class="public-profile-post-empty">Loading posts...</div>
            </div>
          `
          : `
            <div class="public-profile-private">
              <div style="font-size:38px">🔒</div>
              <strong>This account is private</strong>
              <p>Follow this account to see their posts.</p>
            </div>
          `
        }
      </div>
    </div>
  `;

  $("publicFollowBtn")?.addEventListener("click", toggleFollow);

  if (canSeePosts) await loadPublicPosts(userId);
}

window.openPublicProfile = openPublicProfile;

// =====================================================
// PUBLIC PROFILE POSTS
// =====================================================

async function loadPublicPosts(userId) {
  const container = $("publicProfilePosts");
  if (!container) return;

  const { data, error } = await db
    .from("posts")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (activePublicUser?.id !== userId) return;

  if (error) {
    container.innerHTML = `<div class="public-profile-post-empty">Posts could not be loaded.</div>`;
    return;
  }

  const countElement = container
    .closest(".public-profile-body")
    ?.querySelector(".public-profile-stats strong");

  if (countElement) countElement.textContent = data.length;

  if (!data.length) {
    container.innerHTML = `
      <div class="public-profile-post-empty">
        No posts yet. Check back later 💜
      </div>`;
    return;
  }

  container.innerHTML = data.map(post => `
    <div class="public-profile-post">
      ${post.media_url
        ? post.media_type === "video"
          ? `<video src="${escapeHTML(post.media_url)}" muted playsinline controls></video>`
          : `<img src="${escapeHTML(post.media_url)}" alt="Post" loading="lazy">`
        : `<div style="padding:12px;font-size:12px">${escapeHTML(post.caption)}</div>`
      }
    </div>
  `).join("");
}

// =====================================================
// FOLLOW / UNFOLLOW
// =====================================================

async function toggleFollow() {
  if (!currentUser || !activePublicUser) return;

  const targetId = activePublicUser.id;
  const button = $("publicFollowBtn");

  if (!button) return;

  button.disabled = true;

  try {
    const { data: existingFollow, error: followCheckError } = await db
      .from("follows")
      .select("follower_id")
      .eq("follower_id", currentUser.id)
      .eq("following_id", targetId)
      .maybeSingle();

    if (followCheckError) throw followCheckError;

    if (existingFollow) {
      const { error } = await db
        .from("follows")
        .delete()
        .eq("follower_id", currentUser.id)
        .eq("following_id", targetId);

      if (error) throw error;

      notify("Unfollowed.");
      await openPublicProfile(targetId);
      return;
    }

    const { data: existingRequest, error: requestCheckError } = await db
      .from("follow_requests")
      .select("id")
      .eq("requester_id", currentUser.id)
      .eq("receiver_id", targetId)
      .eq("status", "pending")
      .maybeSingle();

    if (requestCheckError) throw requestCheckError;

    if (existingRequest) {
      notify("Your request is already pending.");
      return;
    }

    if (activePublicUser.is_private) {
      const { error } = await db
        .from("follow_requests")
        .insert({
          requester_id: currentUser.id,
          receiver_id: targetId,
          status: "pending"
        });

      if (error) throw error;

      await createNotification(
        targetId,
        "follow_request",
        "sent you a follow request"
      );

      notify("Follow request sent 💜");

    } else {
      const { error } = await db
        .from("follows")
        .insert({
          follower_id: currentUser.id,
          following_id: targetId
        });

      if (error) throw error;

      await createNotification(
        targetId,
        "follow",
        "started following you"
      );

      notify("You're now following this person! 💜");
    }

    await openPublicProfile(targetId);

  } catch (error) {
    console.error(error);
    notify(error.message, true);
  } finally {
    const currentButton = $("publicFollowBtn");
    if (currentButton) currentButton.disabled = false;
  }
}

// =====================================================
// NOTIFICATIONS
// =====================================================

async function createNotification(userId, type, message) {
  if (!currentUser) return;

  const { error } = await db
    .from("notifications")
    .insert({
      user_id: userId,
      actor_id: currentUser.id,
      type,
      message,
      is_read: false
    });

  if (error) console.error("Notification error:", error);
}

async function loadNotifications() {
  if (!currentUser) return;

  const container = $("notificationsList");

  const { data, error } = await db
    .from("notifications")
    .select("*")
    .eq("user_id", currentUser.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error(error);
    if (container) {
      container.innerHTML = `<p class="muted">Could not load notifications.</p>`;
    }
    return;
  }

  const notifications = data || [];
  const unread = notifications.filter(n => !n.is_read).length;

  const badge = $("notificationBadge");

  if (badge) {
    badge.hidden = unread === 0;
    badge.textContent = unread > 9 ? "9+" : unread;
  }

  if (!container) return;

  if (!notifications.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div>♡</div>
        <h3>You're all caught up</h3>
        <p>Your LEAKA activity will appear here.</p>
      </div>`;
    return;
  }

  container.innerHTML = "";

  for (const notification of notifications) {
    const actor = notification.actor_id
      ? await getProfile(notification.actor_id).catch(() => null)
      : null;

    const item = document.createElement("div");

    item.className =
      `notification-item ${notification.is_read ? "" : "unread"}`;

    item.innerHTML = `
      <div class="notification-avatar">
        ${avatarHTML(actor?.avatar_url, profileName(actor))}
      </div>

      <div class="notification-content">
        <p>
          <strong>${escapeHTML(profileName(actor))}</strong>
          ${escapeHTML(notification.message || "interacted with you")}
        </p>
        <small>${timeAgo(notification.created_at)}</small>
      </div>

      ${notification.is_read ? "" : "<span>💜</span>"}
    `;

    item.addEventListener("click", async () => {
      if (notification.is_read) return;

      const { error } = await db
        .from("notifications")
        .update({ is_read: true })
        .eq("id", notification.id)
        .eq("user_id", currentUser.id);

      if (error) {
        notify(error.message, true);
        return;
      }

      await loadNotifications();
    });

    container.appendChild(item);
  }
}

// MARK ALL READ

$("markAllRead")?.addEventListener("click", async () => {
  if (!currentUser) return;

  const { error } = await db
    .from("notifications")
    .update({ is_read: true })
    .eq("user_id", currentUser.id)
    .eq("is_read", false);

  if (error) {
    notify(error.message, true);
    return;
  }

  await loadNotifications();
  notify("All notifications marked as read 💜");
});

// =====================================================
// FOLLOW REQUESTS
// =====================================================

async function loadFollowRequests() {
  if (!currentUser) return [];

  const { data, error } = await db
    .from("follow_requests")
    .select("*")
    .eq("receiver_id", currentUser.id)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error) {
    console.error(error);
    return [];
  }

  return data || [];
}

async function renderFollowRequests(container) {
  if (!container || !currentUser) return;

  const requests = await loadFollowRequests();

  if (!requests.length) {
    container.innerHTML = `<p class="muted">No pending follow requests.</p>`;
    return;
  }

  container.innerHTML = "";

  for (const request of requests) {
    const profile = await getProfile(request.requester_id)
      .catch(() => null);

    if (!profile) continue;

    const item = document.createElement("div");
    item.className = "request-list-item";

    item.innerHTML = `
      <div class="request-avatar">
        ${avatarHTML(profile.avatar_url, profileName(profile))}
      </div>

      <div class="request-info">
        <strong>${escapeHTML(profileName(profile))}</strong>
        <small>@${escapeHTML(username(profile))}</small>
      </div>

      <button data-accept-request="${escapeHTML(request.id)}">Accept</button>

      <button class="decline"
        data-decline-request="${escapeHTML(request.id)}">×</button>
    `;

    container.appendChild(item);
  }
}

async function handleFollowRequest(requestId, accepted) {
  if (!currentUser) return;

  const { data: request, error: fetchError } = await db
    .from("follow_requests")
    .select("*")
    .eq("id", requestId)
    .eq("receiver_id", currentUser.id)
    .eq("status", "pending")
    .single();

  if (fetchError) {
    notify(fetchError.message, true);
    return;
  }

  const { error } = await db
    .from("follow_requests")
    .update({
      status: accepted ? "accepted" : "declined"
    })
    .eq("id", requestId)
    .eq("receiver_id", currentUser.id)
    .eq("status", "pending");

  if (error) {
    notify(error.message, true);
    return;
  }

  if (accepted) {
    const { error: followError } = await db
      .from("follows")
      .upsert({
        follower_id: request.requester_id,
        following_id: currentUser.id
      });

    if (followError) {
      notify(followError.message, true);
      return;
    }

    await createNotification(
      request.requester_id,
      "request_accepted",
      "accepted your follow request"
    );

    notify("Follow request accepted 💜");

  } else {
    notify("Follow request declined.");
  }

  await renderFollowRequests($("followRequestsList"));
  await loadMyCounts();
}

document.addEventListener("click", event => {
  const accept = event.target.closest("[data-accept-request]");
  const decline = event.target.closest("[data-decline-request]");

  if (accept) {
    handleFollowRequest(accept.dataset.acceptRequest, true);
  }

  if (decline) {
    handleFollowRequest(decline.dataset.declineRequest, false);
  }
});

// =====================================================
// PROFILE TABS
// =====================================================

document.querySelectorAll("[data-profile-tab]")
  .forEach(button => {
    button.addEventListener("click", () => {
      document.querySelectorAll("[data-profile-tab]")
        .forEach(tab => tab.classList.remove("selected"));

      button.classList.add("selected");

      const type = button.dataset.profileTab;

      if (type === "posts") {
        loadMyPosts();
      } else if (type === "videos") {
        loadMyPosts();
        notify("Video filtering is coming soon 💜");
      } else {
        notify("Liked posts view is coming soon 💜");
      }
    });
  });


// =====================================================
// LEAKA — INSTAGRAM / WHATSAPP STYLE STORIES
// Grouped Stories • 15s Timer • Sequential Playback
// =====================================================

let storyGroups = [];
let activeStoryGroup = [];
let activeStoryIndex = 0;
let storyTimer = null;
let storyProgressTimer = null;
let storyStartedAt = 0;
let storyRemaining = 15000;
let storyPaused = false;

// Prevent duplicate listeners
let storyInputHandler = null;

// =====================================================
// STORY VIEWER DESIGN
// =====================================================

(function createStoryStyles() {
  if (document.getElementById("leakaStoryStyles")) return;

  const style = document.createElement("style");
  style.id = "leakaStoryStyles";

  style.textContent = `
    .story-create-button {
      border: none;
      background: transparent;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 9px;
      min-width: 100px;
      cursor: pointer;
      color: #c084fc;
    }

    .story-create-button > span {
      width: 76px;
      height: 76px;
      border-radius: 50%;
      border: 2px dashed #b45cff;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 38px;
      background: linear-gradient(145deg,#24132f,#120b1c);
      box-shadow: 0 0 18px #a855f755;
      transition: .2s;
    }

    .story-create-button:active > span {
      transform: scale(.9);
    }

    .story-item {
      border: none;
      background: transparent;
      min-width: 100px;
      cursor: pointer;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      color: white;
    }

    .story-ring {
      width: 82px;
      height: 82px;
      padding: 4px;
      border-radius: 50%;
      background: linear-gradient(45deg,#9333ea,#ec4899,#c084fc);
      box-shadow: 0 0 15px #a855f755;
    }

    .story-avatar {
      width: 100%;
      height: 100%;
      overflow: hidden;
      border-radius: 50%;
      background: #21152e;
      border: 3px solid #130c1c;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .story-avatar img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .story-avatar > * {
      max-width: 100%;
    }

    .story-item small {
      color: #d4c4e4;
      font-size: 12px;
      max-width: 90px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    #storyViewer {
      position: fixed;
      inset: 0;
      z-index: 999999;
      background: #08060d;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
    }

    #storyViewer[hidden] {
      display: none !important;
    }

    .story-viewer-top {
      position: absolute;
      top: max(12px, env(safe-area-inset-top));
      left: 12px;
      right: 12px;
      z-index: 5;
    }

    .story-progress-list {
      display: flex;
      gap: 4px;
      width: 100%;
      margin-bottom: 15px;
    }

    .story-progress-track {
      height: 3px;
      flex: 1;
      background: #ffffff55;
      border-radius: 10px;
      overflow: hidden;
    }

    .story-progress-fill {
      width: 0%;
      height: 100%;
      background: white;
    }

    .story-viewer-user {
      display: flex;
      align-items: center;
      gap: 10px;
      color: white;
      font-weight: bold;
    }

    .story-viewer-user img {
      width: 38px;
      height: 38px;
      border-radius: 50%;
      object-fit: cover;
    }

    .story-close {
      position: absolute;
      top: 5px;
      right: 5px;
      color: white;
      background: #ffffff22;
      border: none;
      border-radius: 50%;
      width: 38px;
      height: 38px;
      font-size: 26px;
      z-index: 10;
    }

    .story-viewer-content {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .story-viewer-content img,
    .story-viewer-content video {
      max-width: 100%;
      max-height: 100%;
      width: 100%;
      height: 100%;
      object-fit: contain;
    }

    .story-tap-left,
    .story-tap-right {
      position: absolute;
      top: 90px;
      bottom: 80px;
      width: 35%;
      z-index: 3;
    }

    .story-tap-left {
      left: 0;
    }

    .story-tap-right {
      right: 0;
    }

    .story-pause-indicator {
      position: absolute;
      color: white;
      font-size: 35px;
      z-index: 8;
      background: #0008;
      padding: 15px;
      border-radius: 50%;
      display: none;
    }
  `;

  document.head.appendChild(style);
})();

// =====================================================
// LOAD AND GROUP STORIES
// =====================================================

async function loadStories() {
  const container = $("storiesContainer");

  if (!container || !currentUser) return;

  const { data, error } = await db
    .from("stories")
    .select("*")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Stories:", error);
    return;
  }

  const grouped = new Map();

  for (const story of data || []) {
    if (!grouped.has(story.user_id)) {
      grouped.set(story.user_id, []);
    }

    grouped.get(story.user_id).push(story);
  }

  storyGroups = [];

  for (const [userId, stories] of grouped) {
    const profile = await getProfile(userId).catch(() => null);

    storyGroups.push({
      userId,
      profile,
      stories
    });
  }

  // Most recently updated users first
  storyGroups.sort((a, b) => {
    const aTime = new Date(
      a.stories[a.stories.length - 1].created_at
    ).getTime();

    const bTime = new Date(
      b.stories[b.stories.length - 1].created_at
    ).getTime();

    return bTime - aTime;
  });

  container.innerHTML = `
    <button id="createStoryBtn" class="story-create-button">
      <span>＋</span>
      <small>Add Story</small>
    </button>
  `;

  $("createStoryBtn").onclick = () => {
    $("storyInput")?.click();
  };

  for (const group of storyGroups) {
    const profile = group.profile;

    const item = document.createElement("button");
    item.className = "story-item";

    item.innerHTML = `
      <div class="story-ring">
        <div class="story-avatar">
          ${avatarHTML(
            profile?.avatar_url,
            profileName(profile)
          )}
        </div>
      </div>

      <small>${escapeHTML(
        group.userId === currentUser.id
          ? "Your Story"
          : profileName(profile)
      )}</small>
    `;

    item.onclick = () => {
      openStoryGroup(group.userId);
    };

    container.appendChild(item);
  }
}

// =====================================================
// CREATE STORY
// =====================================================

const storyInput = $("storyInput");

if (storyInput) {
  storyInput.onchange = async function(event) {
    const file = event.target.files?.[0];

    if (!file || !currentUser) return;

    if (
      !file.type.startsWith("image/") &&
      !file.type.startsWith("video/")
    ) {
      notify("Choose an image or video.", true);
      event.target.value = "";
      return;
    }

    if (file.size > 25 * 1024 * 1024) {
      notify("Maximum file size is 25MB.", true);
      event.target.value = "";
      return;
    }

    try {
      notify("Uploading your story...");

      const url = await uploadMedia(file, "stories");

      if (!url) throw new Error("Media upload failed.");

      const mediaType = file.type.startsWith("video/")
        ? "video"
        : "image";

      const { error } = await db
        .from("stories")
        .insert({
          user_id: currentUser.id,
          media_url: url,
          media_type: mediaType
        });

      if (error) throw error;

      notify("Story published! 💜");

      await loadStories();

    } catch (error) {
      console.error(error);
      notify("Story failed: " + error.message, true);
    } finally {
      event.target.value = "";
    }
  };
}


 // =====================================================
 // STORY VIEWER — LEAKA UPGRADE
 // =====================================================


// =====================================================
// LEAKA — WHATSAPP STYLE STORY VIEWER
// STAGE 1: VIEWER STRUCTURE
// =====================================================

function getStoryViewer() {
  let viewer = $("storyViewer");

  if (viewer) return viewer;

  viewer = document.createElement("div");
  viewer.id = "storyViewer";
  viewer.hidden = true;

  viewer.innerHTML = `
    <div class="story-progress-list"
         id="storyProgressList"></div>

    <div class="story-viewer-top">
      <div class="story-viewer-user"
           id="storyViewerUser"></div>

      <button class="story-close"
              id="storyClose">×</button>
    </div>

    <div class="story-viewer-content"
         id="storyViewerContent"></div>

    <div class="story-tap-left"
         id="storyTapLeft"></div>

    <div class="story-tap-right"
         id="storyTapRight"></div>

    <div class="story-pause-indicator"
         id="storyPauseIndicator">Ⅱ</div>

    <!-- VIEWER REPLY CONTROLS -->
    <div class="story-reply-controls"
         id="storyReplyControls">

      <div class="story-quick-reactions">
        <button data-story-reaction="❤️">❤️</button>
        <button data-story-reaction="😂">😂</button>
        <button data-story-reaction="😮">😮</button>
        <button data-story-reaction="🔥">🔥</button>
      </div>

      <div class="story-reply-bar">
        <input
          id="storyReplyInput"
          type="text"
          placeholder="Reply to story..."
          autocomplete="off">

        <button id="storyReplySend">➤</button>
      </div>
    </div>

    <!-- STORY OWNER VIEWERS BUTTON -->
    <button id="storyViewersButton"
            class="story-viewers-button"
            hidden>
      <span>◉</span>
      <span id="storyViewersCount">0</span>
    </button>

    <!-- VIEWERS PANEL -->
    <div id="storyViewersPanel"
         class="story-viewers-panel"
         hidden>

      <div class="story-viewers-handle"></div>

      <div class="story-viewers-heading">
        <strong>Viewed by</strong>
        <button id="storyViewersClose">×</button>
      </div>

      <div id="storyViewersList"
           class="story-viewers-list">
      </div>
    </div>
  `;

  document.body.appendChild(viewer);

  $("storyClose").onclick = closeStoryViewer;

  $("storyTapLeft").onclick = previousStory;
  $("storyTapRight").onclick = nextStory;

  $("storyViewersClose").onclick = closeStoryViewers;

  $("storyViewersButton").onclick = openStoryViewers;

  return viewer;
}

// =====================================================
// OPEN A PERSON'S STORY GROUP
// =====================================================

function openStoryGroup(userId) {
  const group = storyGroups.find(g => g.userId === userId);

  if (!group || !group.stories.length) return;

  activeStoryGroup = group.stories;
  activeStoryIndex = 0;

  const viewer = getStoryViewer();

  viewer.hidden = false;

  $("storyViewerUser").innerHTML = `
    ${avatarHTML(
      group.profile?.avatar_url,
      profileName(group.profile)
    )}
    <span>${escapeHTML(profileName(group.profile))}</span>
  `;

  const progress = $("storyProgressList");

  progress.innerHTML = activeStoryGroup.map(() => `
    <div class="story-progress-track">
      <div class="story-progress-fill"></div>
    </div>
  `).join("");

  showActiveStory();
}

// =====================================================
// DISPLAY CURRENT STORY
// =====================================================

async function showActiveStory() {
  clearTimeout(storyTimer);
  clearInterval(storyProgressTimer);

  if (activeStoryIndex >= activeStoryGroup.length) {
    closeStoryViewer();
    return;
  }

  const story = activeStoryGroup[activeStoryIndex];
  const content = $("storyViewerContent");

  content.innerHTML = "";

  const media = document.createElement(
    story.media_type === "video" ? "video" : "img"
  );

  media.src = story.media_url;

  if (story.media_type === "video") {
    media.autoplay = true;
    media.muted = false;
    media.playsInline = true;
    media.controls = false;
  }

  content.appendChild(media);

  // Reset story viewing interface
  storyRemaining = 15000;
  storyPaused = false;

  // Hide viewers panel when changing stories
  const panel = $("storyViewersPanel");
  if (panel) panel.hidden = true;

  // Show reply controls only to other people's stories
  const isOwner = story.user_id === currentUser.id;

  const replies = $("storyReplyControls");
  if (replies) replies.hidden = isOwner;

  // Show viewers button only to story owner
  const viewersButton = $("storyViewersButton");

  if (viewersButton) {
    viewersButton.hidden = !isOwner;
  }

  // Load viewer information for owner's story
  if (isOwner) {
    await loadStoryViewers(story.id);
  }

  updateStoryProgress();
  startStoryTimer();

  if (story.media_type === "video") {
    media.play().catch(() => {
      media.muted = true;
      media.play().catch(() => {});
    });
  }
}

// =====================================================
// 15 SECOND TIMER AND PROGRESS
// =====================================================

function startStoryTimer() {
  storyStartedAt = Date.now();

  const fills = document.querySelectorAll(
    ".story-progress-fill"
  );

  const currentFill = fills[activeStoryIndex];

  storyTimer = setTimeout(() => {
    nextStory();
  }, storyRemaining);

  storyProgressTimer = setInterval(() => {
    const elapsed = Date.now() - storyStartedAt;

    const percent = Math.min(
      100,
      ((15000 - storyRemaining + elapsed) / 15000) * 100
    );

    if (currentFill) {
      currentFill.style.width = percent + "%";
    }
  }, 50);
}

function updateStoryProgress() {
  const fills = document.querySelectorAll(
    ".story-progress-fill"
  );

  fills.forEach((fill, index) => {
    fill.style.width = index < activeStoryIndex
      ? "100%"
      : "0%";
  });
}

// =====================================================
// NEXT STORY
// =====================================================

function nextStory() {
  clearTimeout(storyTimer);
  clearInterval(storyProgressTimer);

  activeStoryIndex++;

  if (activeStoryIndex >= activeStoryGroup.length) {
    closeStoryViewer();
    return;
  }

  showActiveStory();
}

// =====================================================
// PREVIOUS STORY
// =====================================================

function previousStory() {
  clearTimeout(storyTimer);
  clearInterval(storyProgressTimer);

  if (activeStoryIndex > 0) {
    activeStoryIndex--;
  }

  showActiveStory();
}

// =====================================================
// PAUSE / RESUME
// =====================================================

function pauseStory() {
  if (storyPaused) return;

  storyPaused = true;

  const elapsed = Date.now() - storyStartedAt;

  storyRemaining = Math.max(
    0,
    storyRemaining - elapsed
  );

  clearTimeout(storyTimer);
  clearInterval(storyProgressTimer);

  const video = $("storyViewerContent")?.querySelector("video");

  if (video) video.pause();

  $("storyPauseIndicator").style.display = "block";
}

function resumeStory() {
  if (!storyPaused) return;

  storyPaused = false;

  $("storyPauseIndicator").style.display = "none";

  const video = $("storyViewerContent")?.querySelector("video");

  if (video) video.play().catch(() => {});

  startStoryTimer();
}

// =====================================================
// CLOSE VIEWER
// =====================================================

function closeStoryViewer() {
  clearTimeout(storyTimer);
  clearInterval(storyProgressTimer);

  const viewer = $("storyViewer");

  if (viewer) {
    const video = viewer.querySelector("video");

    if (video) video.pause();

    viewer.hidden = true;
  }

  activeStoryGroup = [];
  activeStoryIndex = 0;
  storyPaused = false;
}

// =====================================================
// GLOBAL FUNCTIONS
// =====================================================

window.openStory = openStoryGroup;
window.openStoryGroup = openStoryGroup;
window.closeStoryViewer = closeStoryViewer;

// =====================================================
// PRIVACY
// =====================================================

async function loadPrivacySetting() {
  if (!currentUser || !$("privateAccount")) return;

  $("privateAccount").checked =
    !!currentProfile?.is_private;
}

$("privateAccount")?.addEventListener("change", async event => {
  if (!currentUser) return;

  const checkbox = event.target;
  const isPrivate = checkbox.checked;

  checkbox.disabled = true;

  try {
    const { data, error } = await db
      .from("profiles")
      .update({ is_private: isPrivate })
      .eq("id", currentUser.id)
      .select()
      .single();

    if (error) throw error;

    currentProfile = data;

    notify(
      isPrivate
        ? "Your account is now private 🔒"
        : "Your account is now public 💜"
    );

  } catch (error) {
    checkbox.checked = !isPrivate;
    notify(error.message, true);
  } finally {
    checkbox.disabled = false;
  }
});

// =====================================================
// KEYBOARD SUPPORT
// =====================================================

document.addEventListener("keydown", event => {
  if (event.key === "Escape") {
    closePublicProfile();

    const viewer = $("storyViewer");
    if (viewer) viewer.hidden = true;
  }
});

// =====================================================
// START LEAKA
// =====================================================

checkSession().catch(error => {
  console.error("LEAKA startup error:", error);
  notify("Something went wrong starting LEAKA: " + error.message, true);
});

})();

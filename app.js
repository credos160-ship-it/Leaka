
/* =========================================
   LEAKA — COMPLETE APP + SUPABASE
   SOCIAL FEATURES EDITION 💜
========================================= */

const SUPABASE_URL = "https://kiwpmnvoqzrfwblnudjq.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable__oAt1RpObXR5PDqSG7yE1w_SkdZ0Hry";
const BUCKET = "leaka-media";
const REDIRECT_URL = "https://credos160-ship-it.github.io/Leaka/";

/* =========================================
   INITIALIZATION
========================================= */

const $ = id => document.getElementById(id);

function on(id, event, callback) {
  const element = $(id);
  if (element) element.addEventListener(event, callback);
}

function message(id, text) {
  const element = $(id);
  if (element) element.textContent = text;
}

if (!window.supabase) {
  document.body.insertAdjacentHTML(
    "afterbegin",
    '<p style="color:white;padding:20px">LEAKA could not load Supabase. Refresh the page.</p>'
  );
  throw new Error("Supabase library failed to load.");
}

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);

let currentUser = null;
let allPosts = [];
let allLikes = [];
let selectedMedia = null;
let profilePostsTab = "posts";
let handlingAuth = false;
let searchTimeout;
let currentPublicUser = null;

let profile = {
  name: "",
  username: "",
  bio: "Welcome to my LEAKA space 💜",
  avatar: "",
  cover: "",
  isPrivate: false
};

/* =========================================
   HELPERS
========================================= */

function initials(name) {
  return (name || "U")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(x => x[0].toUpperCase())
    .join("");
}

function renderAvatar(element, name, image) {
  if (!element) return;

  element.replaceChildren();

  if (image) {
    const img = document.createElement("img");
    img.src = image;
    img.alt = "Profile picture";
    element.appendChild(img);
  } else {
    element.textContent = initials(name);
  }
}

function makeButton(text, className, callback) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = text;
  button.className = className || "action-btn";
  button.addEventListener("click", callback);
  return button;
}

function showPage(id, scrollTarget) {
  const target = $(id);
  if (!target) return;

  document.querySelectorAll(".page").forEach(page => {
    page.hidden = page.id !== id;
  });

  document.querySelectorAll(".nav-item").forEach(item => {
    item.classList.toggle("active", item.dataset.page === id);
  });

  window.scrollTo({ top: 0, behavior: "smooth" });

  if (scrollTarget) {
    setTimeout(() => {
      $(scrollTarget)?.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    }, 150);
  }

  if (id === "profile") renderProfilePosts();
}

/* =========================================
   SUPABASE PROFILE SYSTEM
========================================= */

async function loadProfile() {
  if (!currentUser) return;

  const key = "leaka_profile_" + currentUser.id;

  let saved = {};

  try {
    saved = JSON.parse(localStorage.getItem(key) || "{}");
  } catch (error) {
    console.warn("Local profile loading error:", error);
  }

  const { data, error } = await supabaseClient
    .from("profiles")
    .select("*")
    .eq("id", currentUser.id)
    .maybeSingle();

  if (error) {
    console.warn("Supabase profile loading:", error.message);
  }

  const metadata = currentUser.user_metadata || {};

  profile = {
    name:
      data?.display_name ||
      saved.name ||
      metadata.display_name ||
      currentUser.email?.split("@")[0] ||
      "User",

    username:
      data?.username ||
      saved.username ||
      metadata.username ||
      currentUser.email?.split("@")[0] ||
      "user",

    bio:
      data?.bio ??
      saved.bio ??
      "Welcome to my LEAKA space 💜",

    avatar:
      data?.avatar_url ||
      saved.avatar ||
      "",

    cover: saved.cover || "",

    isPrivate: Boolean(data?.is_private)
  };

  // Create the profile row if it doesn't exist.
  if (!data) {
    const { error: insertError } = await supabaseClient
      .from("profiles")
      .upsert({
        id: currentUser.id,
        username: profile.username,
        display_name: profile.name,
        bio: profile.bio,
        avatar_url: profile.avatar,
        is_private: profile.isPrivate
      });

    if (insertError) {
      console.warn("Profile creation:", insertError.message);
    }
  }

  renderProfile();
}

function renderProfile() {
  if (!currentUser) return;

  const name = profile.name || "Your name";

  if ($("profileName")) $("profileName").textContent = name;

  if ($("profileEmail")) {
    $("profileEmail").textContent = "@" + profile.username;
  }

  if ($("profileBio")) {
    $("profileBio").textContent = profile.bio;
  }

  if ($("displayName")) {
    $("displayName").value = profile.name;
  }

  if ($("bioInput")) {
    $("bioInput").value = profile.bio;
  }

  if ($("accountEmail")) {
    $("accountEmail").textContent = currentUser.email || "";
  }

  if ($("accountDisplayName")) {
    $("accountDisplayName").textContent = name;
  }

  renderAvatar($("profileAvatar"), name, profile.avatar);
  renderAvatar($("editAvatar"), name, profile.avatar);
  renderAvatar($("profileBtn"), name, profile.avatar);

  const cover = $("profileCover");
  const coverImage = $("profileCoverImage");
  const editPreview = $("editCoverPreview");

  if (profile.cover) {
    if (coverImage) {
      coverImage.src = profile.cover;
      coverImage.hidden = false;
    }

    if (cover) {
      cover.style.backgroundImage = `url("${profile.cover}")`;
      cover.style.backgroundSize = "cover";
      cover.style.backgroundPosition = "center";
    }

    if (editPreview) {
      editPreview.style.backgroundImage = `url("${profile.cover}")`;
      editPreview.style.backgroundSize = "cover";
      editPreview.style.backgroundPosition = "center";
      editPreview.classList.add("has-cover");
      editPreview.textContent = "";
    }
  } else {
    if (coverImage) coverImage.hidden = true;
    if (cover) cover.style.backgroundImage = "";

    if (editPreview) {
      editPreview.style.backgroundImage = "";
      editPreview.classList.remove("has-cover");
      editPreview.textContent = "Your LEAKA cover";
    }
  }

  renderPrivacyControl();
  loadMyFollowCounts();
}

function saveLocalProfile() {
  localStorage.setItem(
    "leaka_profile_" + currentUser.id,
    JSON.stringify(profile)
  );
}

on("saveProfileBtn", "click", async () => {
  if (!currentUser) return;

  const name = $("displayName")?.value.trim();

  if (!name) {
    message("profileMessage", "Please enter a display name.");
    return;
  }

  profile.name = name;
  profile.bio = $("bioInput")?.value.trim() || "";

  const { error } = await supabaseClient
    .from("profiles")
    .upsert({
      id: currentUser.id,
      username: profile.username,
      display_name: profile.name,
      bio: profile.bio,
      avatar_url: profile.avatar,
      is_private: profile.isPrivate
    });

  if (error) {
    message("profileMessage", "Profile save failed: " + error.message);
    return;
  }

  try {
    saveLocalProfile();
    renderProfile();
    message("profileMessage", "Profile saved successfully! 💜");
    showPage("profile");
  } catch (error) {
    message("profileMessage", "Local save error: " + error.message);
  }
});

/* =========================================
   PRIVACY SETTINGS
========================================= */

function renderPrivacyControl() {
  const page = $("profile");
  if (!page) return;

  let container = $("privacyControl");

  if (!container) {
    container = document.createElement("div");
    container.id = "privacyControl";
    container.className = "auth-card";
    container.style.padding = "15px";
    page.appendChild(container);
  }

  container.replaceChildren();

  const heading = document.createElement("h3");
  heading.textContent = "Account privacy 🔒";

  const description = document.createElement("p");
  description.textContent = profile.isPrivate
    ? "Your account is private. People must request to follow you."
    : "Your account is public. Anyone can follow you.";

  const toggle = makeButton(
    profile.isPrivate ? "Make account public" : "Make account private",
    "action-btn",
    togglePrivacy
  );

  container.append(heading, description, toggle);
}

async function togglePrivacy() {
  if (!currentUser) return;

  const newValue = !profile.isPrivate;

  const { error } = await supabaseClient
    .from("profiles")
    .update({ is_private: newValue })
    .eq("id", currentUser.id);

  if (error) {
    alert("Privacy update failed: " + error.message);
    return;
  }

  profile.isPrivate = newValue;

  saveLocalProfile();
  renderPrivacyControl();

  alert(newValue
    ? "Your account is now private 🔒"
    : "Your account is now public 💜"
  );
}

/* =========================================
   STORAGE / MEDIA UPLOAD
========================================= */

async function uploadMedia(file, folder = "posts") {
  if (!currentUser) throw new Error("Please log in first.");

  const extension = file.name.split(".").pop();

  const path =
    currentUser.id + "/" + folder + "/" +
    Date.now() + "." + extension;

  const { error } = await supabaseClient.storage
    .from(BUCKET)
    .upload(path, file, {
      contentType: file.type,
      upsert: true
    });

  if (error) throw error;

  const { data } = supabaseClient.storage
    .from(BUCKET)
    .getPublicUrl(path);

  return data.publicUrl;
}

/* =========================================
   AUTHENTICATION
========================================= */

on("signupBtn", "click", async () => {
  const email = $("email")?.value.trim();
  const password = $("password")?.value;

  if (!email || !password || password.length < 6) {
    message("authMessage", "Enter a valid email and password (6+ characters).");
    return;
  }

  const btn = $("signupBtn");
  btn.disabled = true;
  message("authMessage", "Creating account...");

  try {
    const { data, error } = await supabaseClient.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: REDIRECT_URL
      }
    });

    if (error) throw error;

    message(
      "authMessage",
      data.session
        ? "Welcome to LEAKA! 💜"
        : "Account created! Check your email to confirm."
    );

  } catch (error) {
    message("authMessage", error.message);
  } finally {
    btn.disabled = false;
  }
});

on("loginBtn", "click", async () => {
  const email = $("email")?.value.trim();
  const password = $("password")?.value;

  if (!email || !password) {
    message("authMessage", "Enter your email and password.");
    return;
  }

  const btn = $("loginBtn");
  btn.disabled = true;
  message("authMessage", "Logging in...");

  try {
    const { error } = await supabaseClient.auth.signInWithPassword({
      email,
      password
    });

    if (error) throw error;

    message("authMessage", "Welcome back! 💜");

  } catch (error) {
    message("authMessage", error.message);
  } finally {
    btn.disabled = false;
  }
});

async function logout() {
  const { error } = await supabaseClient.auth.signOut();

  if (error) {
    alert("Logout failed: " + error.message);
  }
}

on("settingsLogoutBtn", "click", () => {
  if (confirm("Are you sure you want to log out?")) logout();
});

on("logoutBtn", "click", () => {
  if (confirm("Are you sure you want to log out?")) logout();
});

/* =========================================
   AUTH STATE
========================================= */

async function updateAuthUI(session) {
  if (handlingAuth) return;

  handlingAuth = true;

  try {
    currentUser = session?.user || null;

    if ($("auth")) $("auth").hidden = !!currentUser;
    if ($("appContent")) $("appContent").hidden = !currentUser;

    if ($("signupBtn")) $("signupBtn").hidden = !!currentUser;
    if ($("loginBtn")) $("loginBtn").hidden = !!currentUser;
    if ($("logoutBtn")) $("logoutBtn").hidden = !currentUser;

    if (currentUser) {
      await loadProfile();
      showPage("home");
      await loadPosts();
      await loadNotifications();
      await loadIncomingRequests();
    } else {
      allPosts = [];
      allLikes = [];
      $("posts")?.replaceChildren();
      $("profilePosts")?.replaceChildren();
    }

  } finally {
    handlingAuth = false;
  }
}

supabaseClient.auth.onAuthStateChange((event, session) => {
  if (event === "INITIAL_SESSION") return;
  setTimeout(() => updateAuthUI(session), 0);
});

async function initializeApp() {
  try {
    const { data, error } = await supabaseClient.auth.getSession();

    if (error) throw error;

    await updateAuthUI(data.session);

  } catch (error) {
    console.error("LEAKA initialization:", error);
    message("authMessage", "Could not start LEAKA: " + error.message);
  }
}

/* =========================================
   NAVIGATION
========================================= */

document.querySelectorAll("[data-page]").forEach(button => {
  button.addEventListener("click", event => {
    event.preventDefault();
    showPage(button.dataset.page, button.dataset.scroll);
  });
});

on("profileBtn", "click", () => showPage("profile"));

/* =========================================
   AVATAR UPLOAD
========================================= */

on("avatarInput", "change", async event => {
  const file = event.target.files[0];
  if (!file) return;

  if (!file.type.startsWith("image/") || file.size > 2 * 1024 * 1024) {
    alert("Choose an image smaller than 2MB.");
    event.target.value = "";
    return;
  }

  try {
    const url = await uploadMedia(file, "avatars");

    profile.avatar = url;

    const { error } = await supabaseClient
      .from("profiles")
      .update({ avatar_url: url })
      .eq("id", currentUser.id);

    if (error) throw error;

    saveLocalProfile();
    renderProfile();
    message("profileMessage", "Profile picture updated! 💜");

  } catch (error) {
    alert("Avatar upload failed: " + error.message);
  }

  event.target.value = "";
});

/* =========================================
   COVER UPLOAD
========================================= */

on("coverInput", "change", async event => {
  const file = event.target.files[0];
  if (!file) return;

  if (!file.type.startsWith("image/") || file.size > 2 * 1024 * 1024) {
    alert("Choose an image smaller than 2MB.");
    event.target.value = "";
    return;
  }

  message("profileMessage", "Uploading your cover...");

  try {
    profile.cover = await uploadMedia(file, "covers");
    saveLocalProfile();
    renderProfile();
    message("profileMessage", "Cover photo updated! 💜");
  } catch (error) {
    alert("Cover upload failed: " + error.message);
  }

  event.target.value = "";
});

/* =========================================
   POST MEDIA PREVIEW
========================================= */

on("mediaInput", "change", () => {
  const file = $("mediaInput")?.files[0];

  $("preview")?.replaceChildren();
  selectedMedia = null;

  if (!file) return;

  if (!file.type.startsWith("image/") &&
      !file.type.startsWith("video/")) {
    alert("Choose an image or video.");
    return;
  }

  if (file.size > 25 * 1024 * 1024) {
    alert("Maximum upload size is 25MB.");
    $("mediaInput").value = "";
    return;
  }

  selectedMedia = file;

  const element = document.createElement(
    file.type.startsWith("video/") ? "video" : "img"
  );

  element.src = URL.createObjectURL(file);
  element.style.width = "100%";

  if (element.tagName === "VIDEO") {
    element.controls = true;
  }

  $("preview")?.appendChild(element);
});

/* =========================================
   CREATE POST
========================================= */

on("postBtn", "click", async () => {
  if (!currentUser) return alert("Please log in first.");

  const caption = $("caption")?.value.trim() || "";

  if (!caption && !selectedMedia) {
    return alert("Write something or upload media first!");
  }

  const btn = $("postBtn");
  btn.disabled = true;
  btn.textContent = "Publishing...";

  try {
    let mediaUrl = null;
    let mediaType = null;

    if (selectedMedia) {
      mediaUrl = await uploadMedia(selectedMedia);
      mediaType = selectedMedia.type.startsWith("video/")
        ? "video"
        : "image";
    }

    const { error } = await supabaseClient.from("posts").insert({
      user_id: currentUser.id,
      caption,
      media_url: mediaUrl,
      media_type: mediaType
    });

    if (error) throw error;

    $("caption").value = "";
    $("mediaInput").value = "";
    $("preview")?.replaceChildren();
    selectedMedia = null;

    alert("Post published! 💜");
    await loadPosts();

  } catch (error) {
    alert("Publishing failed: " + error.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "Publish ↗";
  }
});

/* =========================================
   LOAD POSTS AND LIKES
========================================= */

async function loadLikes() {
  if (!currentUser) return;

  const { data, error } = await supabaseClient
    .from("likes")
    .select("user_id, post_id");

  if (error) {
    console.warn("Likes loading:", error.message);
    allLikes = [];
    return;
  }

  allLikes = data || [];
}

async function loadPosts() {
  if (!currentUser) return;

  if ($("posts")) {
    $("posts").textContent = "Loading your feed...";
  }

  try {
    const { data, error } = await supabaseClient
      .from("posts")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;

    allPosts = data || [];

    await loadLikes();

    renderPosts();
    renderProfilePosts();

  } catch (error) {
    console.error("Post loading:", error);
    if ($("posts")) {
      $("posts").textContent = "Could not load posts: " + error.message;
    }
  }
}

/* =========================================
   LIKES
========================================= */

async function toggleLike(postId) {
  if (!currentUser) return;

  const existing = allLikes.find(
    like =>
      like.post_id === postId &&
      like.user_id === currentUser.id
  );

  try {
    const result = existing
      ? await supabaseClient
          .from("likes")
          .delete()
          .eq("post_id", postId)
          .eq("user_id", currentUser.id)
      : await supabaseClient
          .from("likes")
          .insert({
            post_id: postId,
            user_id: currentUser.id
          });

    if (result.error) throw result.error;

    await loadLikes();
    renderPosts();
    renderProfilePosts();

  } catch (error) {
    alert("Like failed: " + error.message);
  }
}

/* =========================================
   POST ELEMENT
========================================= */

function createPostElement(post) {
  const article = document.createElement("article");
  article.className = "post-card";

  const owner = post.user_id === currentUser?.id;
  const name = owner ? (profile.name || "You") : "LEAKA member";

  const header = document.createElement("div");
  header.className = "post-header";

  const avatar = document.createElement("div");
  avatar.className = "post-avatar";
  renderAvatar(avatar, name, owner ? profile.avatar : "");

  const info = document.createElement("div");

  const username = document.createElement("div");
  username.className = "post-user";
  username.textContent = name;

  const time = document.createElement("div");
  time.className = "post-time";
  time.textContent = post.created_at
    ? new Date(post.created_at).toLocaleString()
    : "";

  info.append(username, time);
  header.append(avatar, info);
  article.append(header);

  if (post.caption) {
    const caption = document.createElement("p");
    caption.className = "post-caption";
    caption.textContent = post.caption;
    article.append(caption);
  }

  if (post.media_url) {
    const media = document.createElement(
      post.media_type === "video" ? "video" : "img"
    );

    media.src = post.media_url;
    media.className = "post-media";

    if (post.media_type === "video") {
      media.controls = true;
      media.playsInline = true;
    } else {
      media.loading = "lazy";
    }

    article.append(media);
  }

  const postLikes = allLikes.filter(
    like => like.post_id === post.id
  );

  const liked = postLikes.some(
    like => like.user_id === currentUser?.id
  );

  const likeBtn = makeButton(
    `${liked ? "❤️" : "🤍"} ${postLikes.length} Likes`,
    "action-btn",
    () => toggleLike(post.id)
  );

  article.append(likeBtn);

  if (owner) {
    const actions = document.createElement("div");
    actions.className = "post-actions";

    actions.append(
      makeButton("✎ Edit", "action-btn", () => editPost(post)),
      makeButton("🗑 Delete", "action-btn", () => deletePost(post))
    );

    article.append(actions);
  }

  return article;
}

/* =========================================
   RENDER POSTS
========================================= */

function renderPosts() {
  const container = $("posts");
  if (!container || !currentUser) return;

  container.replaceChildren();

  if (!allPosts.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div>✦</div>
        <h3>Your story starts here</h3>
        <p>Be the first to share something.</p>
      </div>
    `;
  } else {
    allPosts.forEach(post => {
      container.appendChild(createPostElement(post));
    });
  }

  message(
    "postCount",
    String(allPosts.filter(p => p.user_id === currentUser.id).length)
  );
}

/* =========================================
   EDIT POST
========================================= */

async function editPost(post) {
  if (post.user_id !== currentUser.id) return;

  const caption = prompt("Edit your caption:", post.caption || "");
  if (caption === null) return;

  try {
    const { error } = await supabaseClient
      .from("posts")
      .update({ caption: caption.trim() })
      .eq("id", post.id)
      .eq("user_id", currentUser.id);

    if (error) throw error;

    await loadPosts();
    alert("Post updated! 💜");

  } catch (error) {
    alert("Edit failed: " + error.message);
  }
}

/* =========================================
   DELETE POST
========================================= */

async function deletePost(post) {
  if (post.user_id !== currentUser.id) return;

  if (!confirm("Permanently delete this post?")) return;

  try {
    const { error } = await supabaseClient
      .from("posts")
      .delete()
      .eq("id", post.id)
      .eq("user_id", currentUser.id);

    if (error) throw error;

    await loadPosts();
    alert("Post deleted.");

  } catch (error) {
    alert("Delete failed: " + error.message);
  }
}

/* =========================================
   PROFILE POSTS
========================================= */

function renderProfilePosts() {
  if (!currentUser) return;

  const container = $("profilePosts");
  if (!container) return;

  container.replaceChildren();

  let own = allPosts.filter(
    post => post.user_id === currentUser.id
  );

  if ($("postCount")) {
    $("postCount").textContent = own.length;
  }

  if (profilePostsTab === "videos") {
    own = own.filter(post => post.media_type === "video");
  }

  if (profilePostsTab === "liked") {
    own = allPosts.filter(post =>
      allLikes.some(
        like =>
          like.post_id === post.id &&
          like.user_id === currentUser.id
      )
    );
  }

  if (!own.length) {
    container.innerHTML = `
      <div class="empty-state">
        <h3>No posts yet</h3>
        <p>Your shared moments will appear here.</p>
      </div>
    `;
    return;
  }

  own.forEach(post => {
    container.appendChild(createPostElement(post));
  });
}

document.querySelectorAll("[data-profile-tab]").forEach(button => {
  button.addEventListener("click", () => {
    document.querySelectorAll("[data-profile-tab]").forEach(tab => {
      tab.classList.remove("selected");
    });

    button.classList.add("selected");
    profilePostsTab = button.dataset.profileTab;
    renderProfilePosts();
  });
});

/* =========================================
   FOLLOW SYSTEM
========================================= */

async function getFollowStatus(userId) {
  const [followingResult, requestResult] = await Promise.all([
    supabaseClient
      .from("follows")
      .select("follower_id")
      .eq("follower_id", currentUser.id)
      .eq("following_id", userId)
      .maybeSingle(),

    supabaseClient
      .from("follow_requests")
      .select("id, status")
      .eq("requester_id", currentUser.id)
      .eq("receiver_id", userId)
      .eq("status", "pending")
      .maybeSingle()
  ]);

  if (followingResult.error) throw followingResult.error;
  if (requestResult.error) throw requestResult.error;

  if (followingResult.data) return "following";
  if (requestResult.data) return "requested";

  return "not_following";
}

async function sendNotification(userId, type, text) {
  if (!currentUser || userId === currentUser.id) return;

  const { error } = await supabaseClient
    .from("notifications")
    .insert({
      user_id: userId,
      actor_id: currentUser.id,
      type,
      message: text,
      is_read: false
    });

  if (error) {
    console.warn("Notification failed:", error.message);
  }
}

async function followUser(user) {
  if (!currentUser || user.id === currentUser.id) return;

  try {
    if (user.is_private) {
      const { error } = await supabaseClient
        .from("follow_requests")
        .insert({
          requester_id: currentUser.id,
          receiver_id: user.id,
          status: "pending"
        });

      if (error) throw error;

      await sendNotification(
        user.id,
        "follow_request",
        `${profile.name} requested to follow you.`
      );

      alert("Follow request sent! 💜");

    } else {
      const { error } = await supabaseClient
        .from("follows")
        .insert({
          follower_id: currentUser.id,
          following_id: user.id
        });

      if (error) throw error;

      await sendNotification(
        user.id,
        "follow",
        `${profile.name} started following you.`
      );

      alert("You're now following this user! 💜");
    }

    await openUserProfile(user);

  } catch (error) {
    alert("Follow failed: " + error.message);
  }
}

async function unfollowUser(userId) {
  if (!confirm("Are you sure you want to unfollow this user?")) return;

  try {
    const { error } = await supabaseClient
      .from("follows")
      .delete()
      .eq("follower_id", currentUser.id)
      .eq("following_id", userId);

    if (error) throw error;

    alert("You unfollowed this user.");

    if (currentPublicUser) {
      await openUserProfile(currentPublicUser);
    }

  } catch (error) {
    alert("Unfollow failed: " + error.message);
  }
}

/* =========================================
   FOLLOW COUNTS
========================================= */

async function getFollowCounts(userId) {
  const [followers, following] = await Promise.all([
    supabaseClient
      .from("follows")
      .select("*", { count: "exact", head: true })
      .eq("following_id", userId),

    supabaseClient
      .from("follows")
      .select("*", { count: "exact", head: true })
      .eq("follower_id", userId)
  ]);

  if (followers.error) throw followers.error;
  if (following.error) throw following.error;

  return {
    followers: followers.count || 0,
    following: following.count || 0
  };
}

async function loadMyFollowCounts() {
  if (!currentUser || !$("profile")) return;

  try {
    const counts = await getFollowCounts(currentUser.id);

    let area = $("myFollowCounts");

    if (!area) {
      area = document.createElement("div");
      area.id = "myFollowCounts";
      area.className = "profile-stats";
      $("profile")?.appendChild(area);
    }

    area.textContent =
      `${counts.followers} Followers · ${counts.following} Following`;

  } catch (error) {
    console.warn("Follow counts:", error.message);
  }
}

/* =========================================
   PUBLIC USER PROFILE
========================================= */

async function openUserProfile(user) {
  if (!currentUser) return;

  if (user.id === currentUser.id) {
    showPage("profile");
    return;
  }

  currentPublicUser = user;

  let page = $("publicProfilePage");

  if (!page) {
    page = document.createElement("section");
    page.id = "publicProfilePage";
    page.className = "page";
    page.hidden = true;
    $("appContent")?.appendChild(page);
  }

  page.replaceChildren();

  const back = makeButton(
    "← Back",
    "action-btn",
    () => showPage("home")
  );

  page.appendChild(back);

  try {
    const { data: freshUser, error } = await supabaseClient
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (error) throw error;

    user = freshUser;
    currentPublicUser = user;

    const header = document.createElement("div");
    header.className = "public-profile-header";
    header.style.textAlign = "center";
    header.style.padding = "25px";

    const avatar = document.createElement("div");
    avatar.className = "search-user-avatar";
    avatar.style.width = "100px";
    avatar.style.height = "100px";
    avatar.style.margin = "15px auto";

    renderAvatar(
      avatar,
      user.display_name || user.username,
      user.avatar_url
    );

    const name = document.createElement("h2");
    name.textContent = user.display_name || user.username;

    const username = document.createElement("p");
    username.textContent = "@" + user.username;

    const bio = document.createElement("p");
    bio.textContent = user.bio || "No bio yet.";

    const counts = await getFollowCounts(user.id);

    const stats = document.createElement("p");
    stats.textContent =
      `${counts.followers} Followers · ${counts.following} Following`;

    header.append(avatar, name, username, bio, stats);
    page.appendChild(header);

    const status = await getFollowStatus(user.id);

    const followArea = document.createElement("div");
    followArea.style.textAlign = "center";
    followArea.style.padding = "10px";

    if (status === "following") {
      followArea.appendChild(
        makeButton(
          "Following ✓",
          "action-btn",
          () => unfollowUser(user.id)
        )
      );
    } else if (status === "requested") {
      followArea.appendChild(
        makeButton("Requested ⏳", "action-btn", () => {})
      );
    } else {
      followArea.appendChild(
        makeButton(
          user.is_private ? "Request to Follow" : "Follow +",
          "action-btn",
          () => followUser(user)
        )
      );
    }

    page.appendChild(followArea);

    const postsTitle = document.createElement("h3");
    postsTitle.textContent = "Posts";
    page.appendChild(postsTitle);

    const posts = document.createElement("div");
    posts.id = "publicUserPosts";
    page.appendChild(posts);

    showPage("publicProfilePage");

    if (user.is_private && status !== "following") {
      posts.textContent = "🔒 This account is private. Follow to see posts.";
      return;
    }

    posts.textContent = "Loading posts...";

    const { data, error: postError } = await supabaseClient
      .from("posts")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (postError) throw postError;

    posts.replaceChildren();

    if (!data || !data.length) {
      posts.textContent = "This user hasn't posted anything yet.";
      return;
    }

    const originalUser = currentUser;
    const originalProfile = profile;

    // Render another user's posts without showing your edit controls.
    const oldCurrentUser = currentUser;
    const oldProfile = profile;

    data.forEach(post => {
      posts.appendChild(createPublicPostElement(post, user));
    });

  } catch (error) {
    console.error("Public profile error:", error);
    page.appendChild(
      document.createTextNode("Could not load profile: " + error.message)
    );
    showPage("publicProfilePage");
  }
}

function createPublicPostElement(post, user) {
  const article = document.createElement("article");
  article.className = "post-card";

  const header = document.createElement("div");
  header.className = "post-header";

  const avatar = document.createElement("div");
  avatar.className = "post-avatar";
  renderAvatar(avatar, user.display_name || user.username, user.avatar_url);

  const info = document.createElement("div");

  const name = document.createElement("div");
  name.className = "post-user";
  name.textContent = user.display_name || user.username;

  const time = document.createElement("div");
  time.className = "post-time";
  time.textContent = post.created_at
    ? new Date(post.created_at).toLocaleString()
    : "";

  info.append(name, time);
  header.append(avatar, info);
  article.append(header);

  if (post.caption) {
    const caption = document.createElement("p");
    caption.className = "post-caption";
    caption.textContent = post.caption;
    article.append(caption);
  }

  if (post.media_url) {
    const media = document.createElement(
      post.media_type === "video" ? "video" : "img"
    );

    media.src = post.media_url;
    media.className = "post-media";

    if (post.media_type === "video") {
      media.controls = true;
      media.playsInline = true;
    } else {
      media.loading = "lazy";
    }

    article.append(media);
  }

  const likes = allLikes.filter(l => l.post_id === post.id);
  const liked = likes.some(l => l.user_id === currentUser.id);

  article.appendChild(
    makeButton(
      `${liked ? "❤️" : "🤍"} ${likes.length} Likes`,
      "action-btn",
      () => toggleLike(post.id)
    )
  );

  return article;
}

/* =========================================
   FOLLOW REQUESTS
========================================= */

async function loadIncomingRequests() {
  if (!currentUser) return;

  const { data, error } = await supabaseClient
    .from("follow_requests")
    .select("*")
    .eq("receiver_id", currentUser.id)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error) {
    console.warn("Follow requests:", error.message);
    return;
  }

  let section = $("followRequests");

  if (!section) {
    section = document.createElement("section");
    section.id = "followRequests";
    section.className = "page";
    section.hidden = true;
    section.innerHTML = "<h2>Follow Requests 💜</h2>";

    $("appContent")?.appendChild(section);

    const nav = document.createElement("button");
    nav.className = "nav-item";
    nav.dataset.page = "followRequests";
    nav.textContent = "Follow Requests";
    nav.addEventListener("click", () => showPage("followRequests"));

    $("appContent")?.appendChild(nav);
  }

  section.replaceChildren();

  const title = document.createElement("h2");
  title.textContent = "Follow Requests 💜";
  section.appendChild(title);

  if (!data || !data.length) {
    section.appendChild(document.createTextNode("No pending requests."));
    return;
  }

  for (const request of data) {
    const { data: requester } = await supabaseClient
      .from("profiles")
      .select("id, username, display_name, avatar_url")
      .eq("id", request.requester_id)
      .maybeSingle();

    if (!requester) continue;

    const item = document.createElement("div");
    item.className = "search-user";

    const name = document.createElement("strong");
    name.textContent =
      requester.display_name || requester.username;

    const username = document.createElement("span");
    username.textContent = "@" + requester.username;

    const accept = makeButton(
      "Accept",
      "action-btn",
      () => acceptFollowRequest(request, requester)
    );

    const decline = makeButton(
      "Decline",
      "action-btn",
      () => declineFollowRequest(request)
    );

    item.append(name, username, accept, decline);
    section.appendChild(item);
  }
}

async function acceptFollowRequest(request, requester) {
  try {
    const { error: followError } = await supabaseClient
      .from("follows")
      .insert({
        follower_id: request.requester_id,
        following_id: currentUser.id
      });

    if (followError) throw followError;

    const { error: updateError } = await supabaseClient
      .from("follow_requests")
      .update({ status: "accepted" })
      .eq("id", request.id)
      .eq("receiver_id", currentUser.id);

    if (updateError) throw updateError;

    await sendNotification(
      request.requester_id,
      "request_accepted",
      `${profile.name} accepted your follow request.`
    );

    alert("Follow request accepted! 💜");

    await loadIncomingRequests();
    await loadNotifications();

  } catch (error) {
    alert("Could not accept request: " + error.message);
  }
}

async function declineFollowRequest(request) {
  try {
    const { error } = await supabaseClient
      .from("follow_requests")
      .update({ status: "rejected" })
      .eq("id", request.id)
      .eq("receiver_id", currentUser.id);

    if (error) throw error;

    alert("Request declined.");

    await loadIncomingRequests();

  } catch (error) {
    alert("Could not decline request: " + error.message);
  }
}

/* =========================================
   NOTIFICATIONS
========================================= */

async function loadNotifications() {
  if (!currentUser) return;

  const { data, error } = await supabaseClient
    .from("notifications")
    .select("*")
    .eq("user_id", currentUser.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.warn("Notifications:", error.message);
    return;
  }

  let page = $("notificationsPage");

  if (!page) {
    page = document.createElement("section");
    page.id = "notificationsPage";
    page.className = "page";
    page.hidden = true;
    $("appContent")?.appendChild(page);

    const nav = document.createElement("button");
    nav.className = "nav-item";
    nav.dataset.page = "notificationsPage";
    nav.textContent = "Notifications 🔔";
    nav.addEventListener("click", () => {
      showPage("notificationsPage");
      loadNotifications();
    });

    $("appContent")?.appendChild(nav);
  }

  page.replaceChildren();

  const title = document.createElement("h2");
  title.textContent = "Notifications 🔔";
  page.appendChild(title);

  if (!data || !data.length) {
    page.appendChild(document.createTextNode("You're all caught up! 💜"));
    return;
  }

  for (const notification of data) {
    const item = document.createElement("div");
    item.className = "search-user";

    if (!notification.is_read) {
      item.style.borderLeft = "3px solid #a855f7";
    }

    const text = document.createElement("p");
    text.textContent = notification.message || "New notification";

    const date = document.createElement("small");
    date.textContent = notification.created_at
      ? new Date(notification.created_at).toLocaleString()
      : "";

    item.append(text, date);

    item.addEventListener("click", async () => {
      await supabaseClient
        .from("notifications")
        .update({ is_read: true })
        .eq("id", notification.id)
        .eq("user_id", currentUser.id);

      await loadNotifications();
    });

    page.appendChild(item);
  }
}

/* =========================================
   ACCOUNT SEARCH
========================================= */

async function searchUsers(query) {
  const results = $("searchResults");
  if (!results) return;

  results.replaceChildren();

  if (!query) {
    results.style.display = "none";
    return;
  }

  results.style.display = "block";
  results.textContent = "Searching LEAKA...";

  try {
    const { data, error } = await supabaseClient
      .from("profiles")
      .select("id, username, display_name, avatar_url, is_private")
      .or(
        `username.ilike.%${query}%,display_name.ilike.%${query}%`
      )
      .limit(30);

    if (error) throw error;

    results.replaceChildren();

    const users = (data || []).filter(
      user => user.id !== currentUser?.id
    );

    if (!users.length) {
      results.textContent = "No LEAKA users found.";
      return;
    }

    users.forEach(user => {
      const item = document.createElement("div");
      item.className = "search-user";

      const avatar = document.createElement("div");
      avatar.className = "search-user-avatar";

      renderAvatar(
        avatar,
        user.display_name || user.username,
        user.avatar_url
      );

      const info = document.createElement("div");

      const name = document.createElement("strong");
      name.textContent = user.display_name || user.username;

      const username = document.createElement("span");
      username.textContent = "@" + user.username;

      info.append(name, username);
      item.append(avatar, info);

      item.addEventListener("click", () => {
        results.replaceChildren();
        results.style.display = "none";
        $("search").value = "";
        openUserProfile(user);
      });

      results.appendChild(item);
    });

  } catch (error) {
    console.error("Search error:", error);
    results.textContent = "Search error: " + error.message;
  }
}

on("search", "input", event => {
  clearTimeout(searchTimeout);

  const query = event.target.value.trim().replace(/^@/, "");

  searchTimeout = setTimeout(() => {
    searchUsers(query);
  }, 300);
});

/* =========================================
   STORIES
========================================= */

on("createStoryBtn", "click", () => {
  alert("LEAKA Stories are coming soon! 💜");
});

/* =========================================
   START APP
========================================= */

initializeApp();

console.log("LEAKA initialized successfully 💜");
console.log("LEAKA social features enabled 💜");

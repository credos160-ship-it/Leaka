
/* =========================================
   LEAKA — COMPLETE SOCIAL APP
   Supabase • Profiles • Posts • Likes
   Comments • Following • Privacy • Stories
========================================= */

const SUPABASE_URL = "https://kiwpmnvoqzrfwblnudjq.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable__oAt1RpObXR5PDqSG7yE1w_SkdZ0Hry";
const BUCKET = "leaka-media";

const { createClient } = window.supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;
let currentProfile = null;
let selectedMedia = null;
let searchTimer = null;
let activePublicUser = null;

const $ = id => document.getElementById(id);

// =========================================
// HELPERS
// =========================================

function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
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
    ? `<img src="${escapeHTML(url)}" alt="Profile picture">`
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

// =========================================
// PROFILE RETRIEVAL
// =========================================

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

  if (!profile) {
    const baseName = user.email.split("@")[0];

    const newProfile = {
      id: user.id,
      username: baseName.toLowerCase()
        .replace(/[^a-z0-9_]/g, ""),
      display_name: baseName,
      bio: "Welcome to my LEAKA space 💜"
    };

    const { error } = await db
      .from("profiles")
      .upsert(newProfile);

    if (error) throw error;

    profile = await getProfile(user.id);
  }

  return profile;
}

// =========================================
// AUTHENTICATION
// =========================================

async function startApp(user) {
  if (!user) return;

  currentUser = user;

  try {
    currentProfile = await ensureProfile(user);
  } catch (error) {
    console.error(error);
    notify("Profile loading error: " + error.message, true);
  }

  if ($("auth")) $("auth").hidden = true;
  if ($("appContent")) $("appContent").hidden = false;

  await updateMyProfileUI();
  await loadPosts();
  await loadSearch();
  await loadAccountDetails();
  await loadPrivacySetting();

  const requests = $("followRequestsList");

  if (requests) {
    await renderFollowRequests(requests);
  }
}

async function checkSession() {
  const { data, error } = await db.auth.getSession();

  if (error) {
    console.error(error);
    notify(error.message, true);
  }

  if (data.session?.user) {
    await startApp(data.session.user);
  } else {
    if ($("auth")) $("auth").hidden = false;
    if ($("appContent")) $("appContent").hidden = true;
  }
}

// SIGN UP

$("signupBtn")?.addEventListener("click", async () => {
  const email = $("email")?.value.trim();
  const password = $("password")?.value;

  if (!email || !password) {
    $("authMessage").textContent =
      "Enter your email and password.";
    return;
  }

  if (password.length < 6) {
    $("authMessage").textContent =
      "Password must be at least 6 characters.";
    return;
  }

  $("signupBtn").disabled = true;
  $("authMessage").textContent = "Creating your account...";

  try {
    const { error } = await db.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo:
          "https://credos160-ship-it.github.io/Leaka/"
      }
    });

    if (error) throw error;

    $("authMessage").textContent =
      "Account created! Check your email for confirmation.";
  } catch (error) {
    $("authMessage").textContent = error.message;
  } finally {
    $("signupBtn").disabled = false;
  }
});

// LOGIN

$("loginBtn")?.addEventListener("click", async () => {
  const email = $("email")?.value.trim();
  const password = $("password")?.value;

  if (!email || !password) {
    $("authMessage").textContent =
      "Enter your email and password.";
    return;
  }

  $("loginBtn").disabled = true;
  $("authMessage").textContent = "Logging in...";

  try {
    const { data, error } = await db.auth.signInWithPassword({
      email,
      password
    });

    if (error) throw error;

    await startApp(data.user);

  } catch (error) {
    $("authMessage").textContent = error.message;
  } finally {
    $("loginBtn").disabled = false;
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

  location.reload();
}

$("logoutBtn")?.addEventListener("click", logout);
$("settingsLogoutBtn")?.addEventListener("click", logout);

db.auth.onAuthStateChange((event) => {
  if (event === "SIGNED_OUT") {
    currentUser = null;

    if ($("auth")) $("auth").hidden = false;
    if ($("appContent")) $("appContent").hidden = true;
  }
});

// =========================================
// NAVIGATION
// =========================================

function showPage(pageId) {
  const pages = document.querySelectorAll(
    "#appContent main.page"
  );

  pages.forEach(page => {
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

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });

  if (pageId === "profile") {
    updateMyProfileUI();
  }

  if (pageId === "settings") {
    loadAccountDetails();
    loadPrivacySetting();

    if ($("followRequestsList")) {
      renderFollowRequests($("followRequestsList"));
    }
  }
}

document.addEventListener("click", event => {
  const button = event.target.closest("[data-page]");

  if (!button) return;

  showPage(button.dataset.page);
});

$("profileBtn")?.addEventListener("click", () => {
  showPage("profile");
});

$("settingsGear")?.addEventListener("click", () => {
  showPage("settings");
});

// =========================================
// MEDIA UPLOAD
// =========================================

async function uploadMedia(file, folder = "posts") {
  if (!currentUser || !file) return null;

  if (file.size > 25 * 1024 * 1024) {
    notify("File is too large. Maximum size is 25MB.", true);
    return null;
  }

  const extension =
    file.name.split(".").pop().toLowerCase();

  const path =
    `${folder}/${currentUser.id}/${Date.now()}.${extension}`;

  const { error } = await db.storage
    .from(BUCKET)
    .upload(path, file, {
      upsert: false,
      contentType: file.type
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

// =========================================
// PROFILE
// =========================================

function localProfile() {
  if (!currentUser) return {};

  try {
    return JSON.parse(
      localStorage.getItem(
        "leaka_profile_" + currentUser.id
      ) || "{}"
    );
  } catch {
    return {};
  }
}

async function updateMyProfileUI() {
  if (!currentUser) return;

  const profile = currentProfile || {};
  const local = localProfile();

  const name =
    profile.display_name ||
    local.name ||
    currentUser.email.split("@")[0];

  const avatar =
    profile.avatar_url ||
    local.avatar ||
    "";

  const cover = local.cover || "";

  if ($("profileName")) {
    $("profileName").textContent = name;
  }

  if ($("profileEmail")) {
    $("profileEmail").textContent =
      "@" + username(profile);
  }

  if ($("profileBio")) {
    $("profileBio").textContent =
      profile.bio || local.bio ||
      "Welcome to my LEAKA space 💜";
  }

  if ($("profileAvatar")) {
    $("profileAvatar").innerHTML =
      avatarHTML(avatar, name);
  }

  if ($("editAvatar")) {
    $("editAvatar").innerHTML =
      avatarHTML(avatar, name);
  }

  if ($("profileBtn")) {
    $("profileBtn").innerHTML =
      avatarHTML(avatar, name);
  }

  if ($("profileCoverImage")) {
    if (cover) {
      $("profileCoverImage").src = cover;
      $("profileCoverImage").hidden = false;
    } else {
      $("profileCoverImage").hidden = true;
    }
  }

  if ($("displayName")) {
    $("displayName").value = name;
  }

  if ($("bioInput")) {
    $("bioInput").value =
      profile.bio || local.bio || "";
  }

  if (cover && $("editCoverPreview")) {
    $("editCoverPreview").innerHTML =
      `<img src="${escapeHTML(cover)}" alt="Cover preview">`;
  }

  await loadMyPosts();
}

async function loadAccountDetails() {
  if (!currentUser) return;

  if ($("accountEmail")) {
    $("accountEmail").textContent =
      currentUser.email;
  }

  if ($("accountDisplayName")) {
    $("accountDisplayName").textContent =
      currentProfile?.display_name || "Not set";
  }
}

// PROFILE PICTURE

$("avatarInput")?.addEventListener("change", async event => {
  const file = event.target.files[0];

  if (!file) return;

  if (!file.type.startsWith("image/")) {
    notify("Choose an image.", true);
    return;
  }

  const url = await uploadMedia(file, "avatars");

  if (!url) return;

  const { error } = await db
    .from("profiles")
    .update({ avatar_url: url })
    .eq("id", currentUser.id);

  if (error) {
    notify(error.message, true);
    return;
  }

  currentProfile.avatar_url = url;

  await updateMyProfileUI();

  notify("Profile picture updated 💜");
});

// COVER PHOTO

$("coverInput")?.addEventListener("change", async event => {
  const file = event.target.files[0];

  if (!file) return;

  if (!file.type.startsWith("image/")) {
    notify("Choose an image.", true);
    return;
  }

  const url = await uploadMedia(file, "covers");

  if (!url) return;

  const local = localProfile();
  local.cover = url;

  localStorage.setItem(
    "leaka_profile_" + currentUser.id,
    JSON.stringify(local)
  );

  await updateMyProfileUI();

  notify("Cover photo updated 💜");
});

// SAVE PROFILE

$("saveProfileBtn")?.addEventListener("click", async () => {
  const name = $("displayName")?.value.trim();
  const bio = $("bioInput")?.value.trim();

  if (!name) {
    notify("Enter your display name.", true);
    return;
  }

  $("saveProfileBtn").disabled = true;

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
    $("saveProfileBtn").disabled = false;
  }
});

// =========================================
// CREATE POSTS
// =========================================

$("mediaInput")?.addEventListener("change", event => {
  selectedMedia = event.target.files[0] || null;

  if (!selectedMedia) {
    $("preview").innerHTML = "";
    return;
  }

  if (selectedMedia.size > 25 * 1024 * 1024) {
    notify("Maximum file size is 25MB.", true);
    event.target.value = "";
    selectedMedia = null;
    $("preview").innerHTML = "";
    return;
  }

  const url = URL.createObjectURL(selectedMedia);

  $("preview").innerHTML =
    selectedMedia.type.startsWith("video/")
      ? `<video src="${url}" controls playsinline></video>`
      : `<img src="${url}" alt="Post preview">`;
});

// PUBLISH POST

$("postBtn")?.addEventListener("click", async () => {
  if (!currentUser) return;

  const caption = $("caption")?.value.trim();

  if (!caption && !selectedMedia) {
    notify("Write something or add a photo/video.", true);
    return;
  }

  $("postBtn").disabled = true;
  $("postBtn").textContent = "Publishing...";

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

    await loadPosts();
    await loadMyPosts();

  } catch (error) {
    notify(error.message, true);
  } finally {
    $("postBtn").disabled = false;
    $("postBtn").textContent = "Publish ↗";
  }
});

// =========================================
// LOAD FEED
// =========================================

async function loadPosts() {
  const container = $("posts");

  if (!container || !currentUser) return;

  const { data, error } = await db
    .from("posts")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error(error);
    container.innerHTML =
      `<p class="muted">Could not load posts.</p>`;
    return;
  }

  if (!data.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div>✦</div>
        <h3>Your story starts here</h3>
        <p>Be the first to share something.</p>
      </div>`;
    return;
  }

  container.innerHTML = "";

  for (const post of data) {
    const profile = await getProfile(post.user_id)
      .catch(() => null);

    const { data: likes } = await db
      .from("likes")
      .select("user_id")
      .eq("post_id", post.id);

    const liked = likes?.some(
      like => like.user_id === currentUser.id
    );

    const count = likes?.length || 0;

    const card = document.createElement("article");
    card.className = "post-card";

    card.innerHTML = `
      <div class="post-header">
        <div class="post-avatar">
          ${avatarHTML(
            profile?.avatar_url,
            profileName(profile)
          )}
        </div>

        <div>
          <div class="post-user">
            ${escapeHTML(profileName(profile))}
          </div>
          <div class="post-time">
            @${escapeHTML(username(profile))}
          </div>
        </div>
      </div>

      ${
        post.caption
          ? `<p class="post-caption">${escapeHTML(post.caption)}</p>`
          : ""
      }

      ${
        post.media_url
          ? post.media_type === "video"
            ? `<video class="post-media"
                 src="${escapeHTML(post.media_url)}"
                 controls playsinline></video>`
            : `<img class="post-media"
                 src="${escapeHTML(post.media_url)}"
                 alt="Post">`
          : ""
      }

      <div class="post-actions">
        <button class="action-btn ${liked ? "liked" : ""}"
          data-like="${escapeHTML(post.id)}">
          ${liked ? "♥" : "♡"} ${count} Likes
        </button>

        <button class="action-btn"
          data-comment-focus="${escapeHTML(post.id)}">
          ♧ Comment
        </button>

        ${
          post.user_id === currentUser.id
            ? `<button class="action-btn"
                 data-delete-post="${escapeHTML(post.id)}">
                 Delete
               </button>`
            : ""
        }
      </div>

      <div class="comment-area">
        <input id="comment-${escapeHTML(post.id)}"
          placeholder="Write a comment...">

        <button data-comment="${escapeHTML(post.id)}">
          Send
        </button>
      </div>

      <div class="comments"
        id="comments-${escapeHTML(post.id)}"></div>
    `;

    container.appendChild(card);

    loadComments(post.id);
  }
}

// =========================================
// LIKES
// =========================================

document.addEventListener("click", async event => {
  const button = event.target.closest("[data-like]");

  if (!button || !currentUser) return;

  const postId = button.dataset.like;

  button.disabled = true;

  try {
    const { data: existing } = await db
      .from("likes")
      .select("id")
      .eq("post_id", postId)
      .eq("user_id", currentUser.id)
      .maybeSingle();

    if (existing) {
      const { error } = await db
        .from("likes")
        .delete()
        .eq("id", existing.id);

      if (error) throw error;

    } else {
      const { error } = await db
        .from("likes")
        .insert({
          post_id: postId,
          user_id: currentUser.id
        });

      if (error) throw error;
    }

    await loadPosts();
    await loadMyPosts();

  } catch (error) {
    notify(error.message, true);
  }
});

// =========================================
// COMMENTS
// =========================================

async function loadComments(postId) {
  const { data, error } = await db
    .from("comments")
    .select("*")
    .eq("post_id", postId)
    .order("created_at");

  if (error) return;

  const container = $("comments-" + postId);

  if (!container) return;

  container.innerHTML = "";

  for (const comment of data || []) {
    const profile = await getProfile(comment.user_id)
      .catch(() => null);

    const p = document.createElement("p");

    p.innerHTML = `
      <strong>${escapeHTML(profileName(profile))}:</strong>
      ${escapeHTML(comment.content || comment.comment || "")}
    `;

    container.appendChild(p);
  }
}

document.addEventListener("click", async event => {
  const button = event.target.closest("[data-comment]");

  if (!button || !currentUser) return;

  const postId = button.dataset.comment;
  const input = $("comment-" + postId);

  const content = input?.value.trim();

  if (!content) return;

  button.disabled = true;

  try {
    const { error } = await db
      .from("comments")
      .insert({
        post_id: postId,
        user_id: currentUser.id,
        content
      });

    if (error) throw error;

    input.value = "";

    await loadComments(postId);

  } catch (error) {
    notify(error.message, true);
  } finally {
    button.disabled = false;
  }
});

document.addEventListener("click", event => {
  const button = event.target.closest("[data-comment-focus]");

  if (!button) return;

  $("comment-" + button.dataset.commentFocus)?.focus();
});

// =========================================
// DELETE POSTS
// =========================================

document.addEventListener("click", async event => {
  const button = event.target.closest("[data-delete-post]");

  if (!button || !currentUser) return;

  if (!confirm("Are you sure you want to delete this post?")) {
    return;
  }

  const { error } = await db
    .from("posts")
    .delete()
    .eq("id", button.dataset.deletePost)
    .eq("user_id", currentUser.id);

  if (error) {
    notify(error.message, true);
    return;
  }

  notify("Post deleted.");

  await loadPosts();
  await loadMyPosts();
});

// =========================================
// MY PROFILE POSTS
// =========================================

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

  if ($("postCount")) {
    $("postCount").textContent = data.length;
  }

  const container = $("profilePosts");

  if (container) {
    container.innerHTML = data.length
      ? data.map(post => `
          <div class="public-profile-post">
            ${
              post.media_url
                ? post.media_type === "video"
                  ? `<video src="${escapeHTML(post.media_url)}"
                       muted playsinline></video>`
                  : `<img src="${escapeHTML(post.media_url)}"
                       alt="Post">`
                : `<div>${escapeHTML(post.caption)}</div>`
            }
          </div>
        `).join("")
      : `
          <div class="empty-state">
            <div>✦</div>
            <h3>Your story starts here</h3>
            <p>Your posts will appear here.</p>
          </div>
        `;
  }

  await loadMyCounts();
}

async function loadMyCounts() {
  if (!currentUser) return;

  const { count: followers } = await db
    .from("follows")
    .select("*", { count: "exact", head: true })
    .eq("following_id", currentUser.id);

  const { count: following } = await db
    .from("follows")
    .select("*", { count: "exact", head: true })
    .eq("follower_id", currentUser.id);

  if ($("followerCount")) {
    $("followerCount").textContent = followers || 0;
  }

  if ($("followingCount")) {
    $("followingCount").textContent = following || 0;
  }
}

// =========================================
// SEARCH
// =========================================

async function loadSearch() {
  const input = $("search");

  if (!input) return;

  input.addEventListener("input", () => {
    clearTimeout(searchTimer);

    const query = input.value.trim();

    if (query.length < 2) {
      $("searchResults").innerHTML = "";
      return;
    }

    searchTimer = setTimeout(() => {
      searchUsers(query);
    }, 350);
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

  results.innerHTML = "";

  const people = (data || []).filter(
    profile => profile.id !== currentUser.id
  );

  if (!people.length) {
    results.innerHTML = `
      <div class="empty-state">
        No people found.
      </div>`;
    return;
  }

  people.forEach(profile => {
    const item = document.createElement("div");

    item.className = "search-user";

    item.innerHTML = `
      <div class="search-user-avatar">
        ${avatarHTML(
          profile.avatar_url,
          profileName(profile)
        )}
      </div>

      <div>
        <strong>${escapeHTML(profileName(profile))}</strong>
        <span>@${escapeHTML(username(profile))}</span>
      </div>
    `;

    item.addEventListener("click", () => {
      results.innerHTML = "";
      inputBlur();
      openPublicProfile(profile.id);
    });

    results.appendChild(item);
  });
}

function inputBlur() {
  $("search")?.blur();
}

// =========================================
// PUBLIC PROFILES
// =========================================

function createProfileOverlay() {
  let overlay = $("publicProfileOverlay");

  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "publicProfileOverlay";
    overlay.hidden = true;

    document.body.appendChild(overlay);

    overlay.addEventListener("click", event => {
      if (event.target === overlay) {
        closePublicProfile();
      }
    });
  }

  return overlay;
}

function closePublicProfile() {
  const overlay = $("publicProfileOverlay");

  if (overlay) overlay.hidden = true;

  activePublicUser = null;
}

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
        <button class="public-profile-close"
          onclick="closePublicProfile()">×</button>
      </div>

      <div class="public-profile-body">
        <p style="padding:30px;text-align:center">
          Loading profile...
        </p>
      </div>
    </div>
  `;

  const profile = await getProfile(userId).catch(() => null);

  if (!profile) {
    overlay.innerHTML = `
      <div class="public-profile-card">
        <div class="public-profile-body">
          <button class="public-profile-close"
            onclick="closePublicProfile()">×</button>
          <p>This profile could not be found.</p>
        </div>
      </div>
    `;
    return;
  }

  activePublicUser = profile;

  const local = (() => {
    try {
      return JSON.parse(
        localStorage.getItem("leaka_profile_" + userId) || "{}"
      );
    } catch {
      return {};
    }
  })();

  const { data: follow } = await db
    .from("follows")
    .select("follower_id")
    .eq("follower_id", currentUser.id)
    .eq("following_id", userId)
    .maybeSingle();

  const { data: request } = await db
    .from("follow_requests")
    .select("id,status")
    .eq("requester_id", currentUser.id)
    .eq("receiver_id", userId)
    .eq("status", "pending")
    .maybeSingle();

  const { count: followers } = await db
    .from("follows")
    .select("*", { count: "exact", head: true })
    .eq("following_id", userId);

  const { count: following } = await db
    .from("follows")
    .select("*", { count: "exact", head: true })
    .eq("follower_id", userId);

  const isPrivate = profile.is_private === true;
  const isFollowing = !!follow;
  const isPending = !!request;

  const canSeePosts = !isPrivate || isFollowing;

  const cover = local.cover || "";
  const avatar = profile.avatar_url || "";

  overlay.innerHTML = `
    <div class="public-profile-card">

      <div class="public-profile-cover">
        ${cover ? `<img src="${escapeHTML(cover)}" alt="">` : ""}

        <button class="public-profile-close"
          onclick="closePublicProfile()">×</button>
      </div>

      <div class="public-profile-body">

        <div class="public-profile-top">

          <div class="public-profile-avatar">
            ${avatarHTML(avatar, profileName(profile))}
          </div>

          <div class="public-profile-actions">

            <button class="public-follow-btn
              ${isFollowing ? "following" : ""}"
              id="publicFollowBtn">

              ${
                isFollowing
                  ? "✓ Following"
                  : isPending
                    ? "Requested"
                    : "Follow"
              }

            </button>

            <button class="public-message-btn"
              onclick="notify('Messaging is coming soon 💜')">
              Message
            </button>

          </div>
        </div>

        <h2 class="public-profile-name">
          ${escapeHTML(profileName(profile))}
        </h2>

        <p class="public-profile-handle">
          @${escapeHTML(username(profile))}
        </p>

        <p class="public-profile-bio">
          ${escapeHTML(profile.bio || "Living my LEAKA life 💜")}
        </p>

        <div class="public-profile-stats">

          <div>
            <strong>${canSeePosts ? "..." : "—"}</strong>
            <span>Posts</span>
          </div>

          <div>
            <strong>${followers || 0}</strong>
            <span>Followers</span>
          </div>

          <div>
            <strong>${following || 0}</strong>
            <span>Following</span>
          </div>

        </div>

        ${
          canSeePosts
            ? `
              <div class="public-profile-tabs">
                <button class="selected">Posts</button>
              </div>

              <div class="public-profile-posts"
                id="publicProfilePosts">
                <div class="public-profile-post-empty">
                  Loading posts...
                </div>
              </div>
            `
            : `
              <div class="public-profile-private">
                <div style="font-size:38px">🔒</div>
                <strong>This account is private</strong>
                Follow this account to see their posts.
              </div>
            `
        }

      </div>
    </div>
  `;

  if (canSeePosts) {
    await loadPublicPosts(userId);
  }

  $("publicFollowBtn")?.addEventListener(
    "click",
    toggleFollow
  );
}

// =========================================
// PUBLIC PROFILE POSTS
// =========================================

async function loadPublicPosts(userId) {
  const container = $("publicProfilePosts");

  if (!container) return;

  const { data, error } = await db
    .from("posts")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    container.innerHTML = `
      <div class="public-profile-post-empty">
        Posts could not be loaded.
      </div>`;
    return;
  }

  const countElement = container
    .closest(".public-profile-body")
    ?.querySelector(".public-profile-stats strong");

  if (countElement) {
    countElement.textContent = data.length;
  }

  if (!data.length) {
    container.innerHTML = `
      <div class="public-profile-post-empty">
        No posts yet. Check back later 💜
      </div>`;
    return;
  }

  container.innerHTML = data.map(post => `
    <div class="public-profile-post">

      ${
        post.media_url
          ? post.media_type === "video"
            ? `<video src="${escapeHTML(post.media_url)}"
                 muted playsinline></video>`
            : `<img src="${escapeHTML(post.media_url)}"
                 alt="">`
          : `<div style="padding:12px;font-size:12px">
               ${escapeHTML(post.caption)}
             </div>`
      }

    </div>
  `).join("");
}

// =========================================
// FOLLOW / UNFOLLOW
// =========================================

async function toggleFollow() {
  if (!currentUser || !activePublicUser) return;

  const targetId = activePublicUser.id;
  const button = $("publicFollowBtn");

  if (!button) return;

  button.disabled = true;

  try {
    const { data: existingFollow } = await db
      .from("follows")
      .select("follower_id")
      .eq("follower_id", currentUser.id)
      .eq("following_id", targetId)
      .maybeSingle();

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

    const { data: existingRequest } = await db
      .from("follow_requests")
      .select("id")
      .eq("requester_id", currentUser.id)
      .eq("receiver_id", targetId)
      .eq("status", "pending")
      .maybeSingle();

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

    if (currentButton) {
      currentButton.disabled = false;
    }
  }
}

// =========================================
// NOTIFICATIONS
// =========================================

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

  if (error) {
    console.error("Notification error:", error);
  }
}

// =========================================
// FOLLOW REQUESTS
// =========================================

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
  if (!container) return;

  const requests = await loadFollowRequests();

  if (!requests.length) {
    container.innerHTML = `
      <p class="muted">
        No pending follow requests.
      </p>`;
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
        ${avatarHTML(
          profile.avatar_url,
          profileName(profile)
        )}
      </div>

      <div class="request-info">
        <strong>${escapeHTML(profileName(profile))}</strong>
        <small>@${escapeHTML(username(profile))}</small>
      </div>

      <button data-accept-request="${escapeHTML(request.id)}">
        Accept
      </button>

      <button class="decline"
        data-decline-request="${escapeHTML(request.id)}">
        ×
      </button>
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
    .eq("receiver_id", currentUser.id);

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

  if ($("followRequestsList")) {
    await renderFollowRequests($("followRequestsList"));
  }

  await loadMyCounts();
}

document.addEventListener("click", event => {
  const accept = event.target.closest(
    "[data-accept-request]"
  );

  const decline = event.target.closest(
    "[data-decline-request]"
  );

  if (accept) {
    handleFollowRequest(
      accept.dataset.acceptRequest,
      true
    );
  }

  if (decline) {
    handleFollowRequest(
      decline.dataset.declineRequest,
      false
    );
  }
});

// =========================================
// PROFILE TABS
// =========================================

document.querySelectorAll("[data-profile-tab]")
  .forEach(button => {

    button.addEventListener("click", () => {

      document.querySelectorAll("[data-profile-tab]")
        .forEach(tab => {
          tab.classList.remove("selected");
        });

      button.classList.add("selected");

      const type = button.dataset.profileTab;

      if (type === "posts") {
        loadMyPosts();

      } else if (type === "videos") {
        notify("Video filtering is coming soon 💜");

      } else {
        notify("Liked posts view is coming soon 💜");
      }
    });
  });

// =========================================
// STORIES
// =========================================

$("createStoryBtn")?.addEventListener("click", () => {
  $("storyInput")?.click();
});

$("storyInput")?.addEventListener("change", async event => {
  const file = event.target.files[0];

  if (!file) return;

  if (
    !file.type.startsWith("image/") &&
    !file.type.startsWith("video/")
  ) {
    notify("Choose an image or video.", true);
    return;
  }

  const url = await uploadMedia(file, "stories");

  if (!url) return;

  notify("Story media uploaded 💜 Story publishing still needs a stories database feature.");

  event.target.value = "";
});

// =========================================
// PRIVACY
// =========================================

async function loadPrivacySetting() {
  if (!currentUser || !$("privateAccount")) return;

  $("privateAccount").checked =
    !!currentProfile?.is_private;
}

$("privateAccount")?.addEventListener(
  "change",
  async event => {

    if (!currentUser) return;

    const isPrivate = event.target.checked;

    const { data, error } = await db
      .from("profiles")
      .update({
        is_private: isPrivate
      })
      .eq("id", currentUser.id)
      .select()
      .single();

    if (error) {
      event.target.checked = !isPrivate;
      notify(error.message, true);
      return;
    }

    currentProfile = data;

    notify(
      isPrivate
        ? "Your account is now private 🔒"
        : "Your account is now public 💜"
    );
  }
);

// =========================================
// KEYBOARD SUPPORT
// =========================================

document.addEventListener("keydown", event => {
  if (event.key === "Escape") {
    closePublicProfile();
  }
});

// =========================================
// START LEAKA
// =========================================

checkSession().catch(error => {
  console.error("LEAKA startup error:", error);
  notify("Something went wrong starting LEAKA.", true);
});

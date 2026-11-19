
/* =========================================
   LEAKA — COMPLETE SOCIAL APP
   Supabase + Profiles + Following + Privacy
========================================= */

const SUPABASE_URL = "https://kiwpmnvoqzrfwblnudjq.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable__oAt1RpObXR5PDqSG7yE1w_SkdZ0Hry";
const BUCKET = "leaka-media";

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;
let currentProfile = null;
let selectedMedia = null;
let activePublicUser = null;

// =========================================
// HELPERS
// =========================================

const $ = id => document.getElementById(id);

function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

function avatarHTML(url, name = "U") {
  return url
    ? `<img src="${escapeHTML(url)}" alt="">`
    : escapeHTML((name || "U").charAt(0).toUpperCase());
}

function profileName(profile) {
  return profile?.display_name || profile?.username || "LEAKA User";
}

function username(profile) {
  return profile?.username || "user";
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
    bottom:100px;
    left:50%;
    transform:translateX(-50%);
    background:${error ? "#8e3152" : "#7139bd"};
    color:white;
    padding:13px 22px;
    border-radius:30px;
    z-index:99999;
    box-shadow:0 8px 30px #0004;
    font-size:13px;
  `;

  clearTimeout(window.leakaToastTimer);
  window.leakaToastTimer = setTimeout(() => box.remove(), 2800);
}

// =========================================
// STYLES FOR PUBLIC PROFILES
// =========================================

const profileStyles = document.createElement("style");

profileStyles.textContent = `
#publicProfileOverlay {
  position:fixed;
  inset:0;
  z-index:9990;
  background:rgba(15,10,23,.72);
  backdrop-filter:blur(12px);
  overflow-y:auto;
  padding:25px 12px;
}

.public-profile-card {
  width:min(100%,650px);
  margin:15px auto;
  background:#fdfaff;
  color:#24172f;
  border-radius:24px;
  overflow:hidden;
  box-shadow:0 25px 80px #0005;
  animation:leakaProfileIn .25s ease;
}

@keyframes leakaProfileIn {
  from {opacity:0;transform:translateY(18px)}
  to {opacity:1;transform:translateY(0)}
}

.public-profile-cover {
  height:190px;
  position:relative;
  background:linear-gradient(120deg,#b99af5,#8054c7,#e3b8ed);
}

.public-profile-cover img {
  width:100%;
  height:100%;
  object-fit:cover;
}

.public-profile-close {
  position:absolute;
  top:14px;
  right:14px;
  width:38px;
  height:38px;
  border:0;
  border-radius:50%;
  background:#ffffffdd;
  color:#493365;
  font-size:23px;
  cursor:pointer;
}

.public-profile-body {
  padding:0 24px 25px;
}

.public-profile-top {
  display:flex;
  align-items:flex-end;
  justify-content:space-between;
  gap:12px;
  margin-top:-48px;
  position:relative;
}

.public-profile-avatar {
  width:105px;
  height:105px;
  border:5px solid #fdfaff;
  border-radius:50%;
  background:linear-gradient(135deg,#bd9af4,#7749bf);
  display:grid;
  place-items:center;
  overflow:hidden;
  color:white;
  font-size:32px;
  font-weight:800;
  flex-shrink:0;
}

.public-profile-avatar img {
  width:100%;
  height:100%;
  object-fit:cover;
}

.public-profile-actions {
  display:flex;
  gap:9px;
  padding-bottom:8px;
}

.public-follow-btn,
.public-message-btn {
  border:0;
  border-radius:12px;
  padding:11px 20px;
  font-weight:700;
  font-size:13px;
  cursor:pointer;
  transition:.2s;
}

.public-follow-btn {
  background:linear-gradient(135deg,#9565e5,#713ac1);
  color:white;
  box-shadow:0 5px 15px #9565e544;
}

.public-follow-btn.following {
  background:#eee7f7;
  color:#603b91;
  box-shadow:none;
}

.public-follow-btn:hover,
.public-message-btn:hover {
  transform:translateY(-2px);
}

.public-message-btn {
  background:#f0e9f8;
  color:#684397;
}

.public-profile-name {
  margin-top:16px;
  font-size:25px;
  font-weight:800;
  overflow-wrap:anywhere;
}

.public-profile-handle {
  color:#947fa8;
  font-size:13px;
  margin-top:5px;
}

.public-profile-bio {
  color:#574963;
  font-size:14px;
  line-height:1.7;
  margin-top:15px;
  overflow-wrap:anywhere;
}

.public-profile-stats {
  display:flex;
  gap:35px;
  padding:22px 0;
  margin-top:8px;
  border-bottom:1px solid #eee5f5;
}

.public-profile-stats div {
  display:flex;
  flex-direction:column;
  gap:4px;
}

.public-profile-stats strong {
  font-size:20px;
  color:#352344;
}

.public-profile-stats span {
  font-size:11px;
  color:#9b8ba8;
}

.public-profile-private {
  padding:45px 15px;
  text-align:center;
  color:#846e99;
}

.public-profile-private strong {
  display:block;
  color:#49345e;
  font-size:18px;
  margin-bottom:8px;
}

.public-profile-posts {
  display:grid;
  grid-template-columns:repeat(3,minmax(0,1fr));
  gap:5px;
  padding-top:18px;
}

.public-profile-post {
  aspect-ratio:1;
  background:#eee7f6;
  overflow:hidden;
  cursor:pointer;
}

.public-profile-post img,
.public-profile-post video {
  width:100%;
  height:100%;
  object-fit:cover;
}

.public-profile-post-empty {
  grid-column:1/-1;
  padding:40px 10px;
  text-align:center;
  color:#9886a7;
  font-size:13px;
}

.public-profile-tabs {
  display:flex;
  justify-content:space-around;
  border-bottom:1px solid #eee5f5;
  margin-top:12px;
}

.public-profile-tabs button {
  flex:1;
  padding:14px;
  background:none;
  border:0;
  color:#9b8ba8;
  font-weight:600;
  cursor:pointer;
}

.public-profile-tabs button.selected {
  color:#824ac4;
  border-bottom:2px solid #824ac4;
}

.request-list-item {
  display:flex;
  align-items:center;
  gap:12px;
  padding:13px 0;
  border-bottom:1px solid #eee5f5;
}

.request-list-item img,
.request-list-item .request-avatar {
  width:43px;
  height:43px;
  border-radius:50%;
  object-fit:cover;
  background:#a17ad4;
}

.request-list-item .request-info {
  flex:1;
  min-width:0;
}

.request-list-item small {
  display:block;
  color:#9584a3;
  margin-top:4px;
}

.request-list-item button {
  border:0;
  border-radius:9px;
  padding:9px 12px;
  background:#8050c7;
  color:white;
  cursor:pointer;
  margin-left:4px;
}

.request-list-item button.decline {
  background:#eee7f5;
  color:#654582;
}

@media(max-width:430px) {
  .public-profile-cover {height:155px}
  .public-profile-body {padding:0 16px 20px}
  .public-profile-avatar {width:88px;height:88px}
  .public-profile-name {font-size:22px}
  .public-profile-stats {gap:25px}
  .public-follow-btn,.public-message-btn {padding:10px 13px}
}
`;

document.head.appendChild(profileStyles);

// =========================================
// AUTHENTICATION
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
    const newProfile = {
      id: user.id,
      username: user.email.split("@")[0].toLowerCase().replace(/[^a-z0-9_]/g, ""),
      display_name: user.email.split("@")[0],
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

async function startApp(user) {
  currentUser = user;

  try {
    currentProfile = await ensureProfile(user);
  } catch (error) {
    console.error("Profile error:", error);
    notify("Could not load your profile.", true);
  }

  $("auth").hidden = true;
  $("appContent").hidden = false;

  await updateMyProfileUI();
  await loadPosts();
  await loadSearch();
  await loadAccountDetails();
}

async function checkSession() {
  const { data, error } = await db.auth.getSession();

  if (error) console.error(error);

  if (data.session?.user) {
    await startApp(data.session.user);
  } else {
    $("auth").hidden = false;
    $("appContent").hidden = true;
  }
}

$("signupBtn")?.addEventListener("click", async () => {
  const email = $("email").value.trim();
  const password = $("password").value;

  if (!email || !password) {
    $("authMessage").textContent = "Enter your email and password.";
    return;
  }

  if (password.length < 6) {
    $("authMessage").textContent = "Password must be at least 6 characters.";
    return;
  }

  $("authMessage").textContent = "Creating your account...";

  const { error } = await db.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: "https://credos160-ship-it.github.io/Leaka/"
    }
  });

  if (error) {
    $("authMessage").textContent = error.message;
  } else {
    $("authMessage").textContent =
      "Account created! Check your email if confirmation is enabled.";
  }
});

$("loginBtn")?.addEventListener("click", async () => {
  const email = $("email").value.trim();
  const password = $("password").value;

  if (!email || !password) {
    $("authMessage").textContent = "Enter your email and password.";
    return;
  }

  $("authMessage").textContent = "Logging in...";

  const { data, error } = await db.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    $("authMessage").textContent = error.message;
  } else {
    await startApp(data.user);
  }
});

async function logout() {
  await db.auth.signOut();
  currentUser = null;
  currentProfile = null;
  location.reload();
}

$("logoutBtn")?.addEventListener("click", logout);
$("settingsLogoutBtn")?.addEventListener("click", logout);

db.auth.onAuthStateChange((event, session) => {
  if (event === "SIGNED_OUT") {
    currentUser = null;
    $("auth").hidden = false;
    $("appContent").hidden = true;
  }
});

// =========================================
// NAVIGATION
// =========================================

function showPage(pageId) {
  document.querySelectorAll(".page").forEach(page => {
    const active = page.id === pageId;
    page.hidden = !active;
    page.classList.toggle("active", active);
  });

  document.querySelectorAll(".nav-item").forEach(button => {
    button.classList.toggle(
      "active",
      button.dataset.page === pageId
    );
  });

  window.scrollTo({ top: 0, behavior: "smooth" });

  if (pageId === "profile") updateMyProfileUI();
  if (pageId === "settings") loadAccountDetails();
}

document.addEventListener("click", event => {
  const button = event.target.closest("[data-page]");

  if (!button) return;

  const page = button.dataset.page;
  showPage(page);

  if (button.dataset.scroll) {
    setTimeout(() => {
      $(button.dataset.scroll)?.scrollIntoView({
        behavior: "smooth"
      });
    }, 200);
  }
});

$("profileBtn")?.addEventListener("click", () => showPage("profile"));
$("settingsGear")?.addEventListener("click", () => showPage("settings"));

// =========================================
// MY PROFILE
// =========================================

function localProfile() {
  if (!currentUser) return {};

  try {
    return JSON.parse(
      localStorage.getItem("leaka_profile_" + currentUser.id) || "{}"
    );
  } catch {
    return {};
  }
}

async function updateMyProfileUI() {
  if (!currentUser) return;

  const profile = currentProfile || {};
  const local = localProfile();

  const name = profile.display_name || local.name || currentUser.email.split("@")[0];
  const avatar = profile.avatar_url || local.avatar || "";
  const cover = local.cover || "";

  $("profileName").textContent = name;
  $("profileEmail").textContent = "@" + username(profile);
  $("profileBio").textContent = profile.bio || local.bio || "Welcome to my LEAKA space 💜";

  $("profileAvatar").innerHTML = avatarHTML(avatar, name);
  $("editAvatar").innerHTML = avatarHTML(avatar, name);

  const topAvatar = $("profileBtn");
  if (topAvatar) topAvatar.innerHTML = avatarHTML(avatar, name);

  if (cover) {
    $("profileCoverImage").src = cover;
    $("profileCoverImage").hidden = false;
  } else {
    $("profileCoverImage").hidden = true;
  }

  $("displayName").value = name;
  $("bioInput").value = profile.bio || local.bio || "";

  await loadMyCounts();
  await loadMyPosts();
}

async function loadAccountDetails() {
  if (!currentUser) return;

  $("accountEmail").textContent = currentUser.email;

  $("accountDisplayName").textContent =
    currentProfile?.display_name || "Not set";
}

$("avatarInput")?.addEventListener("change", async event => {
  const file = event.target.files[0];
  if (!file) return;

  const url = await uploadMedia(file, "avatars");

  if (!url) return;

  const { error } = await db
    .from("profiles")
    .update({ avatar_url: url })
    .eq("id", currentUser.id);

  if (error) return notify(error.message, true);

  currentProfile.avatar_url = url;
  await updateMyProfileUI();
  notify("Profile photo updated 💜");
});

$("coverInput")?.addEventListener("change", async event => {
  const file = event.target.files[0];
  if (!file) return;

  const url = await uploadMedia(file, "covers");
  if (!url) return;

  const local = localProfile();
  local.cover = url;

  localStorage.setItem(
    "leaka_profile_" + currentUser.id,
    JSON.stringify(local)
  );

  $("editCoverPreview").innerHTML =
    `<img src="${escapeHTML(url)}" alt="">`;

  await updateMyProfileUI();
  notify("Cover photo updated!");
});

$("saveProfileBtn")?.addEventListener("click", async () => {
  const name = $("displayName").value.trim();
  const bio = $("bioInput").value.trim();

  if (!name) return notify("Enter your display name.", true);

  const { data, error } = await db
    .from("profiles")
    .update({
      display_name: name,
      bio
    })
    .eq("id", currentUser.id)
    .select()
    .single();

  if (error) return notify(error.message, true);

  currentProfile = data;
  await updateMyProfileUI();

  $("profileMessage").textContent = "Profile saved successfully 💜";
  notify("Profile updated!");
});

// =========================================
// MEDIA UPLOAD
// =========================================

async function uploadMedia(file, folder = "posts") {
  if (!currentUser) return null;

  const extension = file.name.split(".").pop();
  const path = `${folder}/${currentUser.id}/${Date.now()}.${extension}`;

  const { error } = await db.storage
    .from(BUCKET)
    .upload(path, file, {
      upsert: true,
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
// POSTS
// =========================================

$("mediaInput")?.addEventListener("change", event => {
  selectedMedia = event.target.files[0] || null;

  if (!selectedMedia) return;

  const url = URL.createObjectURL(selectedMedia);
  const isVideo = selectedMedia.type.startsWith("video/");

  $("preview").innerHTML = isVideo
    ? `<video src="${url}" controls></video>`
    : `<img src="${url}" alt="Preview">`;
});

$("postBtn")?.addEventListener("click", async () => {
  if (!currentUser) return;

  const caption = $("caption").value.trim();

  if (!caption && !selectedMedia) {
    return notify("Write something or add media.", true);
  }

  $("postBtn").disabled = true;
  $("postBtn").textContent = "Publishing...";

  try {
    let mediaUrl = null;
    let mediaType = null;

    if (selectedMedia) {
      mediaUrl = await uploadMedia(selectedMedia);
      if (!mediaUrl) return;
      mediaType = selectedMedia.type.startsWith("video/")
        ? "video"
        : "image";
    }

    const { error } = await db.from("posts").insert({
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

async function loadPosts() {
  const container = $("posts");
  if (!container || !currentUser) return;

  const { data, error } = await db
    .from("posts")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error(error);
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
    const profile = await getProfile(post.user_id).catch(() => null);

    const { data: likes } = await db
      .from("likes")
      .select("user_id")
      .eq("post_id", post.id);

    const liked = likes?.some(like => like.user_id === currentUser.id);
    const count = likes?.length || 0;

    const card = document.createElement("article");
    card.className = "post-card";

    card.innerHTML = `
      <div class="post-header">
        <div class="post-avatar">
          ${avatarHTML(profile?.avatar_url, profileName(profile))}
        </div>
        <div>
          <div class="post-user">${escapeHTML(profileName(profile))}</div>
          <div class="post-time">@${escapeHTML(username(profile))}</div>
        </div>
      </div>

      ${post.caption ? `<p class="post-caption">${escapeHTML(post.caption)}</p>` : ""}

      ${post.media_url ? (
        post.media_type === "video"
          ? `<video class="post-media" src="${escapeHTML(post.media_url)}" controls playsinline></video>`
          : `<img class="post-media" src="${escapeHTML(post.media_url)}" alt="Post">`
      ) : ""}

      <div class="post-actions">
        <button class="action-btn ${liked ? "liked" : ""}" data-like="${post.id}">
          ${liked ? "♥" : "♡"} ${count} Likes
        </button>
        <button class="action-btn" data-comment-focus="${post.id}">
          ♧ Comment
        </button>
        ${post.user_id === currentUser.id
          ? `<button class="action-btn" data-delete-post="${post.id}">Delete</button>`
          : ""}
      </div>

      <div class="comment-area">
        <input id="comment-${post.id}" placeholder="Write a comment...">
        <button data-comment="${post.id}">Send</button>
      </div>
      <div class="comments" id="comments-${post.id}"></div>
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

  const { data: existing } = await db
    .from("likes")
    .select("id")
    .eq("post_id", postId)
    .eq("user_id", currentUser.id)
    .maybeSingle();

  if (existing) {
    await db.from("likes").delete().eq("id", existing.id);
  } else {
    const { error } = await db.from("likes").insert({
      post_id: postId,
      user_id: currentUser.id
    });

    if (error) return notify(error.message, true);
  }

  await loadPosts();
  await loadMyPosts();
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
    const profile = await getProfile(comment.user_id).catch(() => null);

    const p = document.createElement("p");
    p.innerHTML = `<strong>${escapeHTML(profileName(profile))}:</strong> ${escapeHTML(comment.content || comment.comment || "")}`;
    container.appendChild(p);
  }
}

document.addEventListener("click", async event => {
  const button = event.target.closest("[data-comment]");
  if (!button || !currentUser) return;

  const postId = button.dataset.comment;
  const input = $("comment-" + postId);
  const content = input.value.trim();

  if (!content) return;

  const { error } = await db.from("comments").insert({
    post_id: postId,
    user_id: currentUser.id,
    content
  });

  if (error) return notify(error.message, true);

  input.value = "";
  await loadComments(postId);
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
  if (!button) return;

  if (!confirm("Delete this post?")) return;

  const { error } = await db
    .from("posts")
    .delete()
    .eq("id", button.dataset.deletePost)
    .eq("user_id", currentUser.id);

  if (error) return notify(error.message, true);

  notify("Post deleted.");
  await loadPosts();
  await loadMyPosts();
});

// =========================================
// MY PROFILE POSTS AND COUNTS
// =========================================

async function loadMyPosts() {
  if (!currentUser) return;

  const { data, error } = await db
    .from("posts")
    .select("*")
    .eq("user_id", currentUser.id)
    .order("created_at", { ascending: false });

  if (error) return;

  $("postCount").textContent = data.length;

  $("profilePosts").innerHTML = data.length
    ? data.map(post => `
        <div class="public-profile-post">
          ${post.media_url
            ? post.media_type === "video"
              ? `<video src="${escapeHTML(post.media_url)}"></video>`
              : `<img src="${escapeHTML(post.media_url)}" alt="">`
            : `<div>${escapeHTML(post.caption)}</div>`}
        </div>
      `).join("")
    : `<div class="empty-state">
         <div>✦</div>
         <h3>Your story starts here</h3>
         <p>Your shared moments will appear here.</p>
       </div>`;

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

  $("followerCount").textContent = followers || 0;
  $("followingCount").textContent = following || 0;
}

// =========================================
// SEARCH USERS
// =========================================

let searchTimer;

async function loadSearch() {
  const input = $("search");
  if (!input) return;

  input.setAttribute("autocomplete", "off");
  input.setAttribute("autocorrect", "off");
  input.setAttribute("autocapitalize", "none");
  input.setAttribute("spellcheck", "false");
  input.setAttribute("name", "leaka-user-search");

  input.addEventListener("input", () => {
    clearTimeout(searchTimer);

    const query = input.value.trim();

    if (query.length < 2) {
      $("searchResults").innerHTML = "";
      return;
    }

    searchTimer = setTimeout(() => searchUsers(query), 350);
  });
}

async function searchUsers(query) {
  const results = $("searchResults");

  const { data, error } = await db
    .from("profiles")
    .select("id,username,display_name,avatar_url,is_private")
    .or(`username.ilike.%${query}%,display_name.ilike.%${query}%`)
    .limit(15);

  if (error) {
    console.error(error);
    return;
  }

  results.innerHTML = "";

  if (!data.length) {
    results.innerHTML = `
      <div class="search-user">
        No people found.
      </div>`;
    return;
  }

  data.filter(profile => profile.id !== currentUser.id).forEach(profile => {
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
      $("search").blur();
      openPublicProfile(profile.id);
    });

    results.appendChild(item);
  });
}

// =========================================
// PUBLIC PROFILE SYSTEM
// =========================================

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
        <p style="padding:30px;text-align:center">Loading profile...</p>
      </div>
    </div>
  `;

  const profile = await getProfile(userId).catch(() => null);

  if (!profile) {
    overlay.innerHTML = `
      <div class="public-profile-card">
        <button class="public-profile-close" onclick="closePublicProfile()">×</button>
        <div class="public-profile-body">
          <p class="public-profile-private">This profile could not be found.</p>
        </div>
      </div>`;
    return;
  }

  activePublicUser = profile;

  const local = (() => {
    try {
      return JSON.parse(localStorage.getItem("leaka_profile_" + userId) || "{}");
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
  const avatar = profile.avatar_url || local.avatar || "";

  overlay.innerHTML = `
    <div class="public-profile-card">

      <div class="public-profile-cover">
        ${cover ? `<img src="${escapeHTML(cover)}" alt="">` : ""}
        <button class="public-profile-close" onclick="closePublicProfile()">×</button>
      </div>

      <div class="public-profile-body">

        <div class="public-profile-top">
          <div class="public-profile-avatar">
            ${avatarHTML(avatar, profileName(profile))}
          </div>

          <div class="public-profile-actions">
            <button
              class="public-follow-btn ${isFollowing ? "following" : ""}"
              id="publicFollowBtn"
              data-target-user="${userId}">
              ${isFollowing ? "✓ Following" : isPending ? "Requested" : "Follow"}
            </button>
            <button class="public-message-btn" onclick="notify('Messaging is coming soon 💜')">
              Message
            </button>
          </div>
        </div>

        <h2 class="public-profile-name">${escapeHTML(profileName(profile))}</h2>
        <p class="public-profile-handle">@${escapeHTML(username(profile))}</p>

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

        ${canSeePosts ? `
          <div class="public-profile-tabs">
            <button class="selected">Posts</button>
          </div>
          <div class="public-profile-posts" id="publicProfilePosts">
            <div class="public-profile-post-empty">Loading posts...</div>
          </div>
        ` : `
          <div class="public-profile-private">
            <div style="font-size:38px;margin-bottom:12px">🔒</div>
            <strong>This account is private</strong>
            Follow this account to see their photos and videos.
          </div>
        `}

      </div>
    </div>
  `;

  if (canSeePosts) {
    await loadPublicPosts(userId);
  }

  $("publicFollowBtn")?.addEventListener("click", toggleFollow);
}

// =========================================
// FOLLOW / UNFOLLOW / REQUEST
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
      .select("id,status")
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
    if (currentButton) currentButton.disabled = false;
  }
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
          ? `<video src="${escapeHTML(post.media_url)}" muted playsinline></video>`
          : `<img src="${escapeHTML(post.media_url)}" alt="">`
        : `<div style="padding:12px;font-size:12px">${escapeHTML(post.caption)}</div>`
      }
    </div>
  `).join("");
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

  if (error) console.error("Notification error:", error);
}

// =========================================
// FOLLOW REQUEST MANAGEMENT
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
  const requests = await loadFollowRequests();

  if (!requests.length) {
    container.innerHTML = `
      <p style="color:#9584a3;padding:15px 0">
        No pending follow requests.
      </p>`;
    return;
  }

  container.innerHTML = "";

  for (const request of requests) {
    const profile = await getProfile(request.requester_id).catch(() => null);

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
      <button data-accept-request="${request.id}">Accept</button>
      <button class="decline" data-decline-request="${request.id}">×</button>
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

  if (fetchError) return notify(fetchError.message, true);

  const { error } = await db
    .from("follow_requests")
    .update({
      status: accepted ? "accepted" : "declined"
    })
    .eq("id", requestId)
    .eq("receiver_id", currentUser.id);

  if (error) return notify(error.message, true);

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

  const container = $("followRequestsList");
  if (container) await renderFollowRequests(container);

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

// =========================================
// PROFILE TABS
// =========================================

document.querySelectorAll("[data-profile-tab]").forEach(button => {
  button.addEventListener("click", () => {
    document.querySelectorAll("[data-profile-tab]").forEach(tab => {
      tab.classList.remove("selected");
    });

    button.classList.add("selected");

    const type = button.dataset.profileTab;

    if (type === "posts") {
      loadMyPosts();
    } else if (type === "videos") {
      loadMyPosts();
      notify("Video filtering is coming soon.");
    } else {
      notify("Liked posts view is coming soon.");
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

  const url = await uploadMedia(file, "stories");
  if (!url) return;

  notify("Story uploaded to storage. Story publishing is coming soon.");
});

// =========================================
// PRIVACY SETTING
// =========================================

async function loadPrivacySetting() {
  if (!currentUser || !$("privateAccount")) return;

  $("privateAccount").checked = !!currentProfile?.is_private;
}

$("privateAccount")?.addEventListener("change", async event => {
  const isPrivate = event.target.checked;

  const { data, error } = await db
    .from("profiles")
    .update({ is_private: isPrivate })
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
});

// =========================================
// START APP
// =========================================

checkSession();

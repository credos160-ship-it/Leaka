
/* =========================================
   LEAKA — FULL APP + SUPABASE
   STABLE VERSION
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
  else console.warn("LEAKA: Missing element:", id);
}

function message(id, text) {
  const element = $(id);
  if (element) element.textContent = text;
}

if (!window.supabase) {
  document.body.insertAdjacentHTML(
    "afterbegin",
    '<p style="color:white;padding:20px">LEAKA could not load Supabase. Please refresh the page.</p>'
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

let profile = {
  name: "",
  bio: "Welcome to my LEAKA space 💜",
  avatar: "",
  cover: ""
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
   PROFILE
========================================= */

function renderProfile() {
  if (!currentUser) return;

  const name = profile.name || "Your name";

  if ($("profileName")) $("profileName").textContent = name;

  if ($("profileEmail")) {
    $("profileEmail").textContent =
      "@" + (currentUser.email || "username").split("@")[0];
  }

  if ($("profileBio")) $("profileBio").textContent = profile.bio;

  if ($("displayName")) {
    $("displayName").value = profile.name || "";
  }

  if ($("bioInput")) {
    $("bioInput").value = profile.bio || "";
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
}

function loadProfile() {
  const key = "leaka_profile_" + currentUser.id;

  try {
    const saved = JSON.parse(localStorage.getItem(key) || "null");

    profile = {
      name: saved?.name || currentUser.email?.split("@")[0] || "User",
      bio: saved?.bio || "Welcome to my LEAKA space 💜",
      avatar: saved?.avatar || "",
      cover: saved?.cover || ""
    };
  } catch (error) {
    console.error("Profile loading error:", error);
  }

  renderProfile();
}

function saveProfile() {
  localStorage.setItem(
    "leaka_profile_" + currentUser.id,
    JSON.stringify(profile)
  );

  renderProfile();
}

on("saveProfileBtn", "click", () => {
  const name = $("displayName")?.value.trim();

  if (!name) {
    message("profileMessage", "Please enter a display name.");
    return;
  }

  profile.name = name;
  profile.bio = $("bioInput")?.value.trim() || "";

  try {
    saveProfile();
    message("profileMessage", "Profile saved successfully! 💜");
    showPage("profile");
  } catch (error) {
    message("profileMessage", "Could not save profile: " + error.message);
  }
});

/* =========================================
   SUPABASE STORAGE
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
   SIGN UP
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

/* =========================================
   LOGIN
========================================= */

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

/* =========================================
   LOGOUT
========================================= */

async function logout() {
  try {
    const { error } = await supabaseClient.auth.signOut();
    if (error) throw error;
  } catch (error) {
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
      loadProfile();
      showPage("home");
      await loadPosts();
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
    console.error("LEAKA initialization error:", error);
    message("authMessage", "Could not start LEAKA: " + error.message);
  }
}

initializeApp();

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
   PROFILE PHOTO UPLOAD
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
    saveProfile();

    message("profileMessage", "Profile picture updated! 💜");

  } catch (error) {
    alert("Avatar upload failed: " + error.message);
  }
});

/* =========================================
   COVER PHOTO UPLOAD
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
    const url = await uploadMedia(file, "covers");

    profile.cover = url;
    saveProfile();

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
  const file = $("mediaInput").files[0];

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
  if (!currentUser) {
    alert("Please log in first.");
    return;
  }

  const text = $("caption")?.value.trim() || "";

  if (!text && !selectedMedia) {
    alert("Write something or upload media first!");
    return;
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
      caption: text,
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
   LOAD LIKES
========================================= */

async function loadLikes() {
  if (!currentUser) return;

  try {
    const { data, error } = await supabaseClient
      .from("likes")
      .select("user_id, post_id");

    if (error) throw error;

    allLikes = data || [];

  } catch (error) {
    console.warn("Likes could not load:", error.message);

    // Keep the feed working even if Likes has a problem.
    allLikes = [];
  }
}

/* =========================================
   LOAD POSTS
========================================= */

async function loadPosts() {
  if (!currentUser) return;

  if ($("posts")) {
    $("posts").innerHTML = `
      <div class="empty-state">
        <h3>Loading your feed...</h3>
      </div>
    `;
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
    console.error("Post loading error:", error);

    if ($("posts")) {
      $("posts").textContent =
        "Could not load posts: " + error.message;
    }
  }
}

/* =========================================
   LIKE / UNLIKE
========================================= */

async function toggleLike(postId) {
  if (!currentUser) return;

  const existingLike = allLikes.find(
    like =>
      like.post_id === postId &&
      like.user_id === currentUser.id
  );

  try {
    if (existingLike) {
      const { error } = await supabaseClient
        .from("likes")
        .delete()
        .eq("post_id", postId)
        .eq("user_id", currentUser.id);

      if (error) throw error;

    } else {
      const { error } = await supabaseClient
        .from("likes")
        .insert({
          post_id: postId,
          user_id: currentUser.id
        });

      if (error) throw error;
    }

    await loadLikes();

    renderPosts();
    renderProfilePosts();

  } catch (error) {
    alert("Like failed: " + error.message);
  }
}

/* =========================================
   CREATE POST ELEMENT
========================================= */

function createPostElement(post) {
  const article = document.createElement("article");
  article.className = "post-card";

  const owner = post.user_id === currentUser.id;
  const name = owner ? (profile.name || "You") : "LEAKA member";

  // HEADER

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

  // CAPTION

  if (post.caption) {
    const caption = document.createElement("p");
    caption.className = "post-caption";
    caption.textContent = post.caption;
    article.append(caption);
  }

  // MEDIA

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

  // LIKES

  const likeBtn = document.createElement("button");
  likeBtn.className = "action-btn";
  likeBtn.type = "button";

  const postLikes = allLikes.filter(
    like => like.post_id === post.id
  );

  const likedByMe = postLikes.some(
    like => like.user_id === currentUser.id
  );

  likeBtn.textContent =
    `${likedByMe ? "❤️" : "🤍"} ${postLikes.length} Likes`;

  likeBtn.addEventListener("click", () => {
    toggleLike(post.id);
  });

  article.append(likeBtn);

  // EDIT AND DELETE

  if (owner) {
    const actions = document.createElement("div");
    actions.className = "post-actions";

    const edit = document.createElement("button");
    edit.className = "action-btn";
    edit.type = "button";
    edit.textContent = "✎ Edit";

    edit.addEventListener("click", () => editPost(post));

    const del = document.createElement("button");
    del.className = "action-btn";
    del.type = "button";
    del.textContent = "🗑 Delete";

    del.addEventListener("click", () => deletePost(post));

    actions.append(edit, del);
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
   EDIT OWN POST
========================================= */

async function editPost(post) {
  if (post.user_id !== currentUser.id) return;

  const caption = prompt(
    "Edit your caption:",
    post.caption || ""
  );

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
   DELETE OWN POST
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
   SEARCH
========================================= */

on("search", "input", event => {
  const query = event.target.value.toLowerCase();

  document.querySelectorAll("#posts .post-card").forEach(post => {
    post.style.display =
      post.textContent.toLowerCase().includes(query)
        ? ""
        : "none";
  });
});

/* =========================================
   STORIES
========================================= */

on("createStoryBtn", "click", () => {
  alert("LEAKA Stories are coming soon! 💜");
});

/* =========================================
   END OF LEAKA
========================================= */

console.log("LEAKA initialized successfully 💜");

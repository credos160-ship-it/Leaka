const SUPABASE_URL = "https://kiwpmnvoqzrfwblnudjq.supabase.co";

const SUPABASE_ANON_KEY = "sb_publishable__oAt1RpObXR5PDqSG7yE1w_SkdZ0Hry";

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);
const caption = document.getElementById("caption");
const mediaInput = document.getElementById("mediaInput");
const preview = document.getElementById("preview");
const posts = document.getElementById("posts");
const postBtn = document.getElementById("postBtn");

let selectedMedia = null;

mediaInput.addEventListener("change", () => {
  const file = mediaInput.files[0];

  preview.replaceChildren();
  selectedMedia = null;

  if (!file) return;

  if (!file.type.startsWith("image/") &&
      !file.type.startsWith("video/")) {
    alert("Please select an image or video.");
    mediaInput.value = "";
    return;
  }

  if (file.size > 25 * 1024 * 1024) {
    alert("File is too large. Maximum size is 25MB.");
    mediaInput.value = "";
    return;
  }

  selectedMedia = file;

  const url = URL.createObjectURL(file);
  const element = document.createElement(
    file.type.startsWith("video/") ? "video" : "img"
  );

  element.src = url;

  if (element.tagName === "VIDEO") {
    element.controls = true;
  }

  preview.appendChild(element);
});

postBtn.addEventListener("click", () => {
  const text = caption.value.trim();

  if (!text && !selectedMedia) {
    alert("Write something or upload a photo/video first!");
    return;
  }

  const post = document.createElement("article");
  post.className = "post-card";

  const header = document.createElement("div");
  header.className = "post-header";

  const avatar = document.createElement("div");
  avatar.className = "post-avatar";
  avatar.textContent = "U";

  const userInfo = document.createElement("div");

  const username = document.createElement("div");
  username.className = "post-user";
  username.textContent = "You";

  const time = document.createElement("div");
  time.className = "post-time";
  time.textContent = "Just now";

  userInfo.append(username, time);
  header.append(avatar, userInfo);

  post.appendChild(header);

  if (text) {
    const description = document.createElement("p");
    description.className = "post-caption";
    description.textContent = text;
    post.appendChild(description);
  }

  if (selectedMedia) {
    const url = URL.createObjectURL(selectedMedia);
    const media = document.createElement(
      selectedMedia.type.startsWith("video/")
        ? "video" : "img"
    );

    media.src = url;
    media.className = "post-media";

    if (media.tagName === "VIDEO") {
      media.controls = true;
    }

    post.appendChild(media);
  }

  const actions = document.createElement("div");
  actions.className = "post-actions";

  const likeBtn = document.createElement("button");
  likeBtn.className = "action-btn";
  likeBtn.textContent = "♡ Like 0";

  let liked = false;
  let likes = 0;

  likeBtn.addEventListener("click", () => {
    liked = !liked;
    likes += liked ? 1 : -1;

    likeBtn.textContent = `${liked ? "♥" : "♡"} Like ${likes}`;
    likeBtn.classList.toggle("liked", liked);
  });

  const commentLabel = document.createElement("span");
  commentLabel.className = "action-btn";
  commentLabel.textContent = "▢ Comment";

  actions.append(likeBtn, commentLabel);
  post.appendChild(actions);

  const commentArea = document.createElement("div");
  commentArea.className = "comment-area";

  const commentInput = document.createElement("input");
  commentInput.placeholder = "Write a comment...";

  const commentBtn = document.createElement("button");
  commentBtn.textContent = "Send";

  const comments = document.createElement("div");
  comments.className = "comments";

  const addComment = () => {
    const value = commentInput.value.trim();

    if (!value) return;

    const comment = document.createElement("p");
    comment.textContent = "You: " + value;

    comments.appendChild(comment);
    commentInput.value = "";
  };

  commentBtn.addEventListener("click", addComment);

  commentInput.addEventListener("keydown", event => {
    if (event.key === "Enter") addComment();
  });

  commentArea.append(commentInput, commentBtn);
  post.append(commentArea, comments);

  const empty = posts.querySelector(".empty-state");
  if (empty) empty.remove();

  posts.prepend(post);

  caption.value = "";
  mediaInput.value = "";
  preview.replaceChildren();
  selectedMedia = null;
});

document.getElementById("search").addEventListener("input", event => {
  const query = event.target.value.toLowerCase();

  document.querySelectorAll(".post-card").forEach(post => {
    post.style.display = post.textContent.toLowerCase()
      .includes(query) ? "" : "none";
  });
});
// LEAKA AUTHENTICATION

const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const signupBtn = document.getElementById("signupBtn");
const loginBtn = document.getElementById("loginBtn");
const logoutBtn = document.getElementById("logoutBtn");
const authMessage = document.getElementById("authMessage");

signupBtn.addEventListener("click", async () => {
  const email = emailInput.value.trim();
  const password = passwordInput.value;

  if (!email || !password) {
    authMessage.textContent = "Enter your email and password.";
    return;
  }

  if (password.length < 6) {
    authMessage.textContent = "Password must be at least 6 characters.";
    return;
  }

  const { error } = await supabaseClient.auth.signUp({
    email,
    password
  });

  if (error) {
    authMessage.textContent = error.message;
  } else {
    authMessage.textContent =
      "Account created! Check your email to confirm your account.";
  }
});

loginBtn.addEventListener("click", async () => {
  const email = emailInput.value.trim();
  const password = passwordInput.value;

  const { error } = await supabaseClient.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    authMessage.textContent = error.message;
  } else {
    authMessage.textContent = "Welcome back to Leaka! 💜";
  }
});

logoutBtn.addEventListener("click", async () => {
  const { error } = await supabaseClient.auth.signOut();

  if (error) {
    authMessage.textContent = error.message;
  } else {
    authMessage.textContent = "You have logged out.";
  }
});
async function updateAuthUI() {
  const { data: { session } } =
    await supabaseClient.auth.getSession();

  const appContent = document.getElementById("appContent");
  const authSection = document.getElementById("auth");

  signupBtn.hidden = !!session;
  loginBtn.hidden = !!session;
  logoutBtn.hidden = !session;

  appContent.hidden = !session;
  authSection.hidden = !!session;
}

supabaseClient.auth.onAuthStateChange(() => {
  updateAuthUI();
});

updateAuthUI();
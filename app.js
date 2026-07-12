"use strict";

/* =========================================================
   ACFA COMMUNITY POLL
   ========================================================= */

const SUPABASE_URL =
  "https://leryhqzhrdkrfsdqbmch.supabase.co";

const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_TSAqo3OxVgP97n2b7yeQCw_zuBWltp8";

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);

/* =========================================================
   PAGE ELEMENTS
   ========================================================= */

const questionElement = document.getElementById("question");
const optionsElement = document.getElementById("options");
const voteButton = document.getElementById("voteButton");
const countdownElement = document.getElementById("countdown");
const resultsElement = document.getElementById("results");

/* =========================================================
   STATE
   ========================================================= */

let currentPoll = null;
let currentOptions = [];
let selectedOptionId = null;
let countdownTimer = null;
let resultsRefreshTimer = null;

/* =========================================================
   VOTER IDENTIFICATION
   ========================================================= */

function createFallbackId() {
  return (
    "voter-" +
    Date.now() +
    "-" +
    Math.random().toString(36).slice(2)
  );
}

function getVoterKey() {
  const storageName = "acfa_poll_voter_key";

  try {
    let voterKey = localStorage.getItem(storageName);

    if (!voterKey) {
      if (
        window.crypto &&
        typeof window.crypto.randomUUID === "function"
      ) {
        voterKey = window.crypto.randomUUID();
      } else {
        voterKey = createFallbackId();
      }

      localStorage.setItem(storageName, voterKey);
    }

    return voterKey;
  } catch (error) {
    console.warn(
      "Local storage is unavailable. Using temporary voter ID.",
      error
    );

    return createFallbackId();
  }
}

function getVoteStorageName(pollId) {
  return "acfa_poll_voted_" + pollId;
}

function hasVotedLocally(pollId) {
  try {
    return (
      localStorage.getItem(getVoteStorageName(pollId)) ===
      "true"
    );
  } catch (error) {
    return false;
  }
}

function rememberVote(pollId) {
  try {
    localStorage.setItem(
      getVoteStorageName(pollId),
      "true"
    );
  } catch (error) {
    console.warn(
      "Unable to save local voting status.",
      error
    );
  }
}

/* =========================================================
   POLL STATUS
   ========================================================= */

function getTimeValue(value) {
  const time = new Date(value).getTime();

  return Number.isFinite(time) ? time : 0;
}

function isPollOpen() {
  if (!currentPoll) {
    return false;
  }

  const now = Date.now();
  const opensAt = getTimeValue(currentPoll.opens_at);
  const closesAt = getTimeValue(currentPoll.closes_at);

  return (
    currentPoll.status === "open" &&
    now >= opensAt &&
    now < closesAt
  );
}

function shouldDisplayResults() {
  if (!currentPoll) {
    return false;
  }

  return (
    currentPoll.show_live_results === true ||
    !isPollOpen() ||
    hasVotedLocally(currentPoll.id)
  );
}

/* =========================================================
   INITIALIZATION
   ========================================================= */

async function initializePoll() {
  showLoadingState();

  try {
    await loadCurrentPoll();
  } catch (error) {
    console.error("Unable to initialize poll:", error);

    showFatalError(
      "The poll could not be loaded. Please try again shortly."
    );
  }
}

/* =========================================================
   LOAD CURRENT POLL
   ========================================================= */

async function loadCurrentPoll() {
  const pollResponse = await supabaseClient
    .from("polls")
    .select("*")
    .in("status", ["open", "closed"])
    .order("created_at", { ascending: false })
    .limit(1);

  if (pollResponse.error) {
    throw pollResponse.error;
  }

  if (
    !Array.isArray(pollResponse.data) ||
    pollResponse.data.length === 0
  ) {
    showNoPoll();
    return;
  }

  currentPoll = pollResponse.data[0];

  const optionsResponse = await supabaseClient
    .from("poll_options")
    .select("*")
    .eq("poll_id", currentPoll.id)
    .order("display_order", { ascending: true });

  if (optionsResponse.error) {
    throw optionsResponse.error;
  }

  currentOptions = Array.isArray(optionsResponse.data)
    ? optionsResponse.data
    : [];

  if (currentOptions.length === 0) {
    throw new Error(
      "The current poll does not contain any options."
    );
  }

  renderPoll();
  startCountdown();
  startResultsRefresh();

  if (shouldDisplayResults()) {
    await loadResults();
  }
}

/* =========================================================
   RENDER POLL
   ========================================================= */

function renderPoll() {
  questionElement.textContent = currentPoll.question;
  optionsElement.innerHTML = "";
  resultsElement.innerHTML = "";

  selectedOptionId = null;

  const pollOpen = isPollOpen();
  const alreadyVoted = hasVotedLocally(currentPoll.id);

  currentOptions.forEach(function (option) {
    const wrapper = document.createElement("div");
    wrapper.className = "option";

    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = "poll-option";
    radio.id = "option-" + option.id;
    radio.value = String(option.id);
    radio.disabled = !pollOpen || alreadyVoted;

    const label = document.createElement("label");
    label.htmlFor = radio.id;
    label.textContent = option.option_text;

    radio.addEventListener("change", function () {
      selectedOptionId = option.id;

      if (isPollOpen()) {
        voteButton.disabled = false;
      }
    });

    wrapper.appendChild(radio);
    wrapper.appendChild(label);
    optionsElement.appendChild(wrapper);
  });

  updateVoteButtonState();
}

/* =========================================================
   VOTE BUTTON STATE
   ========================================================= */

function updateVoteButtonState() {
  if (!currentPoll) {
    voteButton.disabled = true;
    voteButton.textContent = "Unavailable";
    return;
  }

  if (!isPollOpen()) {
    voteButton.disabled = true;
    voteButton.textContent = "Voting Closed";
    return;
  }

  if (hasVotedLocally(currentPoll.id)) {
    voteButton.disabled = true;
    voteButton.textContent = "Vote Recorded";
    return;
  }

  voteButton.disabled = selectedOptionId === null;
  voteButton.textContent = "Vote";
}

/* =========================================================
   SUBMIT VOTE
   ========================================================= */

voteButton.addEventListener("click", submitVote);

async function submitVote() {
  clearTemporaryMessages();

  if (!currentPoll || selectedOptionId === null) {
    return;
  }

  if (!isPollOpen()) {
    updateVoteButtonState();
    await loadResults();
    return;
  }

  if (hasVotedLocally(currentPoll.id)) {
    updateVoteButtonState();
    await loadResults();
    return;
  }

  voteButton.disabled = true;
  voteButton.textContent = "Submitting...";

  const voterKey = getVoterKey();

  try {
    const voteResponse = await supabaseClient
      .from("votes")
      .insert({
        poll_id: currentPoll.id,
        option_id: selectedOptionId,
        voter_key: voterKey
      });

    if (voteResponse.error) {
      if (voteResponse.error.code === "23505") {
        rememberVote(currentPoll.id);
        disableOptions();

        voteButton.disabled = true;
        voteButton.textContent =
          "Vote Already Recorded";

        await loadResults();

        showTemporaryMessage(
          "A vote from this browser has already been recorded.",
          "success-message"
        );

        return;
      }

      throw voteResponse.error;
    }

    rememberVote(currentPoll.id);
    disableOptions();

    voteButton.disabled = true;
    voteButton.textContent = "Vote Recorded";

    await loadResults();

    showTemporaryMessage(
      "Your vote has been counted.",
      "success-message"
    );
  } catch (error) {
    console.error("Unable to submit vote:", error);

    voteButton.disabled = false;
    voteButton.textContent = "Vote";

    showTemporaryMessage(
      "Your vote could not be submitted. Please try again.",
      "error-message"
    );
  }
}

/* =========================================================
   LOAD RESULTS
   ========================================================= */

async function loadResults() {
  if (!currentPoll) {
    return;
  }

  try {
    const votesResponse = await supabaseClient
      .from("votes")
      .select("option_id")
      .eq("poll_id", currentPoll.id);

    if (votesResponse.error) {
      throw votesResponse.error;
    }

    const totals = {};

    currentOptions.forEach(function (option) {
      totals[option.id] = 0;
    });

    const votes = Array.isArray(votesResponse.data)
      ? votesResponse.data
      : [];

    votes.forEach(function (vote) {
      if (
        Object.prototype.hasOwnProperty.call(
          totals,
          vote.option_id
        )
      ) {
        totals[vote.option_id] += 1;
      }
    });

    const totalVotes = Object.values(totals).reduce(
      function (sum, count) {
        return sum + count;
      },
      0
    );

    renderResults(totals, totalVotes);
  } catch (error) {
    console.error("Unable to load poll results:", error);
  }
}

/* =========================================================
   RENDER RESULTS
   ========================================================= */

function renderResults(totals, totalVotes) {
  resultsElement.innerHTML = "";

  currentOptions.forEach(function (option) {
    const count = totals[option.id] || 0;

    const percentage =
      totalVotes > 0
        ? Math.round((count / totalVotes) * 100)
        : 0;

    const row = document.createElement("div");
    row.className = "result-row";

    const topLine = document.createElement("div");
    topLine.className = "result-topline";

    const optionName = document.createElement("span");
    optionName.textContent = option.option_text;

    const optionResult = document.createElement("span");
    optionResult.textContent =
      percentage +
      "% (" +
      count +
      " " +
      (count === 1 ? "vote" : "votes") +
      ")";

    topLine.appendChild(optionName);
    topLine.appendChild(optionResult);

    const bar = document.createElement("div");
    bar.className = "result-bar";

    const fill = document.createElement("div");
    fill.className = "result-fill";

    bar.appendChild(fill);
    row.appendChild(topLine);
    row.appendChild(bar);
    resultsElement.appendChild(row);

    window.requestAnimationFrame(function () {
      fill.style.width = percentage + "%";
    });
  });

  const totalMessage = document.createElement("div");
  totalMessage.className = "status-message";
  totalMessage.textContent =
    totalVotes +
    " total " +
    (totalVotes === 1 ? "vote" : "votes");

  resultsElement.appendChild(totalMessage);
}

/* =========================================================
   COUNTDOWN
   ========================================================= */

function startCountdown() {
  if (countdownTimer) {
    window.clearInterval(countdownTimer);
  }

  updateCountdown();

  countdownTimer = window.setInterval(
    updateCountdown,
    1000
  );
}

function updateCountdown() {
  if (!currentPoll) {
    return;
  }

  const now = Date.now();
  const opensAt = getTimeValue(currentPoll.opens_at);
  const closesAt = getTimeValue(currentPoll.closes_at);

  if (now < opensAt) {
    countdownElement.textContent =
      "Voting opens " +
      formatDate(currentPoll.opens_at);

    voteButton.disabled = true;
    voteButton.textContent = "Poll Not Open";
    disableOptions();

    return;
  }

  const remaining = closesAt - now;

  if (
    remaining <= 0 ||
    currentPoll.status === "closed" ||
    currentPoll.status === "archived"
  ) {
    countdownElement.textContent =
      "Voting closed " +
      formatDate(currentPoll.closes_at);

    voteButton.disabled = true;
    voteButton.textContent = "Voting Closed";

    disableOptions();

    if (countdownTimer) {
      window.clearInterval(countdownTimer);
      countdownTimer = null;
    }

    loadResults();
    return;
  }

  const days = Math.floor(
    remaining / 86400000
  );

  const hours = Math.floor(
    (remaining % 86400000) / 3600000
  );

  const minutes = Math.floor(
    (remaining % 3600000) / 60000
  );

  const seconds = Math.floor(
    (remaining % 60000) / 1000
  );

  countdownElement.textContent =
    "Voting closes in " +
    days +
    "d " +
    hours +
    "h " +
    minutes +
    "m " +
    seconds +
    "s";
}

/* =========================================================
   LIVE RESULTS REFRESH
   ========================================================= */

function startResultsRefresh() {
  if (resultsRefreshTimer) {
    window.clearInterval(resultsRefreshTimer);
  }

  resultsRefreshTimer = window.setInterval(
    async function () {
      if (
        currentPoll &&
        shouldDisplayResults()
      ) {
        await loadResults();
      }
    },
    30000
  );
}

/* =========================================================
   DISPLAY HELPERS
   ========================================================= */

function disableOptions() {
  const radios = optionsElement.querySelectorAll(
    'input[type="radio"]'
  );

  radios.forEach(function (radio) {
    radio.disabled = true;
  });
}

function showLoadingState() {
  questionElement.textContent = "Loading poll...";
  optionsElement.innerHTML = "";
  resultsElement.innerHTML = "";

  countdownElement.textContent = "Loading...";

  voteButton.disabled = true;
  voteButton.textContent = "Vote";
}

function showNoPoll() {
  questionElement.textContent =
    "No active community poll";

  optionsElement.innerHTML = "";
  resultsElement.innerHTML = "";

  countdownElement.textContent =
    "Check back soon for the next poll.";

  voteButton.disabled = true;
  voteButton.textContent =
    "No Poll Available";
}

function showFatalError(message) {
  questionElement.textContent = "Community Poll";

  optionsElement.innerHTML = "";
  resultsElement.innerHTML = "";

  countdownElement.textContent = "";

  voteButton.disabled = true;
  voteButton.textContent = "Unavailable";

  const errorMessage = document.createElement("div");
  errorMessage.className =
    "status-message error-message";

  errorMessage.textContent = message;

  resultsElement.appendChild(errorMessage);
}

function clearTemporaryMessages() {
  const messages = resultsElement.querySelectorAll(
    ".success-message, .error-message"
  );

  messages.forEach(function (message) {
    message.remove();
  });
}

function showTemporaryMessage(message, className) {
  clearTemporaryMessages();

  const messageElement =
    document.createElement("div");

  messageElement.className =
    "status-message " + className;

  messageElement.textContent = message;

  resultsElement.prepend(messageElement);
}

function formatDate(value) {
  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) {
    return "at the scheduled time";
  }

  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

/* =========================================================
   START THE POLL
   ========================================================= */

initializePoll();
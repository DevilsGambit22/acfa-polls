"use strict";

/* =========================================================
   ACFA COMMUNITY POLL
   Public forum widget powered by Supabase
   ========================================================= */

const SUPABASE_URL =
  "https://leryhqzhrdkrfsdqbmeh.supabase.co";

const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_TSAqo3OxVgP97n2b7yeQCw_zuBWltp8";

const client = window.supabase.createClient(
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

let currentPoll = null;
let currentOptions = [];
let countdownTimer = null;
let selectedOptionId = null;

/* =========================================================
   VOTER IDENTIFIER
   ========================================================= */

function getVoterKey() {
  const storageKey = "acfa_poll_voter_key";

  let voterKey = localStorage.getItem(storageKey);

  if (!voterKey) {
    voterKey =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `voter-${Date.now()}-${Math.random()
            .toString(36)
            .slice(2)}`;

    localStorage.setItem(storageKey, voterKey);
  }

  return voterKey;
}

function getVoteStorageKey(pollId) {
  return `acfa_poll_voted_${pollId}`;
}

function hasVoted(pollId) {
  return (
    localStorage.getItem(getVoteStorageKey(pollId)) === "true"
  );
}

function rememberVote(pollId) {
  localStorage.setItem(
    getVoteStorageKey(pollId),
    "true"
  );
}

/* =========================================================
   POLL STATE
   ========================================================= */

function isPollOpen() {
  if (!currentPoll) {
    return false;
  }

  const now = Date.now();
  const opensAt = new Date(currentPoll.opens_at).getTime();
  const closesAt = new Date(currentPoll.closes_at).getTime();

  return (
    currentPoll.status === "open" &&
    now >= opensAt &&
    now < closesAt
  );
}

function shouldShowResults() {
  if (!currentPoll) {
    return false;
  }

  return (
    currentPoll.show_live_results === true ||
    !isPollOpen() ||
    hasVoted(currentPoll.id)
  );
}

/* =========================================================
   LOAD CURRENT POLL
   ========================================================= */

async function loadPoll() {
  setLoadingState();

  try {
    const { data: polls, error: pollError } = await client
      .from("polls")
      .select("*")
      .in("status", ["open", "closed"])
      .order("created_at", { ascending: false })
      .limit(1);

    if (pollError) {
      throw pollError;
    }

    if (!polls || polls.length === 0) {
      showNoPoll();
      return;
    }

    currentPoll = polls[0];

    const { data: options, error: optionsError } =
      await client
        .from("poll_options")
        .select("*")
        .eq("poll_id", currentPoll.id)
        .order("display_order", { ascending: true });

    if (optionsError) {
      throw optionsError;
    }

    currentOptions = options || [];

    renderPoll();
    startCountdown();

    if (shouldShowResults()) {
      await loadResults();
    }
  } catch (error) {
    console.error("Unable to load poll:", error);

    showError(
      "The poll could not be loaded. Please try again shortly."
    );
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
  const alreadyVoted = hasVoted(currentPoll.id);

  currentOptions.forEach((option) => {
    const optionWrapper = document.createElement("div");
    optionWrapper.className = "option";

    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = "poll-option";
    radio.id = `option-${option.id}`;
    radio.value = String(option.id);
    radio.disabled = !pollOpen || alreadyVoted;

    const label = document.createElement("label");
    label.htmlFor = radio.id;
    label.textContent = option.option_text;

    radio.addEventListener("change", () => {
      selectedOptionId = option.id;
      voteButton.disabled = false;
    });

    optionWrapper.appendChild(radio);
    optionWrapper.appendChild(label);
    optionsElement.appendChild(optionWrapper);
  });

  if (!pollOpen) {
    voteButton.disabled = true;
    voteButton.textContent = "Voting Closed";
  } else if (alreadyVoted) {
    voteButton.disabled = true;
    voteButton.textContent = "Vote Recorded";
  } else {
    voteButton.disabled = true;
    voteButton.textContent = "Vote";
  }
}

/* =========================================================
   SUBMIT VOTE
   ========================================================= */

voteButton.addEventListener("click", async () => {
  if (!currentPoll || !selectedOptionId) {
    return;
  }

  if (!isPollOpen()) {
    voteButton.disabled = true;
    voteButton.textContent = "Voting Closed";

    await loadResults();
    return;
  }

  if (hasVoted(currentPoll.id)) {
    voteButton.disabled = true;
    voteButton.textContent = "Vote Recorded";

    await loadResults();
    return;
  }

  voteButton.disabled = true;
  voteButton.textContent = "Submitting...";

  try {
    const voterKey = getVoterKey();

    const { error } = await client
      .from("votes")
      .insert({
        poll_id: currentPoll.id,
        option_id: selectedOptionId,
        voter_key: voterKey
      });

    if (error) {
      if (error.code === "23505") {
        rememberVote(currentPoll.id);

        voteButton.textContent =
          "Vote Already Recorded";

        disableOptions();
        await loadResults();
        return;
      }

      throw error;
    }

    rememberVote(currentPoll.id);

    voteButton.textContent = "Vote Recorded";

    disableOptions();
    await loadResults();

    showSuccessMessage(
      "Your vote has been counted."
    );
  } catch (error) {
    console.error("Unable to submit vote:", error);

    voteButton.disabled = false;
    voteButton.textContent = "Vote";

    showVoteError(
      "Your vote could not be submitted. Please try again."
    );
  }
});

/* =========================================================
   LOAD RESULTS
   ========================================================= */

async function loadResults() {
  if (!currentPoll) {
    return;
  }

  try {
    const { data: votes, error } = await client
      .from("votes")
      .select("option_id")
      .eq("poll_id", currentPoll.id);

    if (error) {
      throw error;
    }

    const totals = {};

    currentOptions.forEach((option) => {
      totals[option.id] = 0;
    });

    (votes || []).forEach((vote) => {
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
      (sum, count) => sum + count,
      0
    );

    renderResults(totals, totalVotes);
  } catch (error) {
    console.error("Unable to load results:", error);
  }
}

/* =========================================================
   RENDER RESULTS
   ========================================================= */

function renderResults(totals, totalVotes) {
  resultsElement.innerHTML = "";

  currentOptions.forEach((option) => {
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

    const optionTotal = document.createElement("span");
    optionTotal.textContent =
      `${percentage}% (${count} ${
        count === 1 ? "vote" : "votes"
      })`;

    topLine.appendChild(optionName);
    topLine.appendChild(optionTotal);

    const bar = document.createElement("div");
    bar.className = "result-bar";

    const fill = document.createElement("div");
    fill.className = "result-fill";

    bar.appendChild(fill);

    row.appendChild(topLine);
    row.appendChild(bar);

    resultsElement.appendChild(row);

    requestAnimationFrame(() => {
      fill.style.width = `${percentage}%`;
    });
  });

  const totalMessage = document.createElement("div");
  totalMessage.className = "status-message";
  totalMessage.textContent =
    `${totalVotes} total ${
      totalVotes === 1 ? "vote" : "votes"
    }`;

  resultsElement.appendChild(totalMessage);
}

/* =========================================================
   COUNTDOWN
   ========================================================= */

function startCountdown() {
  clearInterval(countdownTimer);

  updateCountdown();

  countdownTimer = setInterval(() => {
    updateCountdown();
  }, 1000);
}

function updateCountdown() {
  if (!currentPoll) {
    return;
  }

  const now = Date.now();
  const opensAt = new Date(currentPoll.opens_at).getTime();
  const closesAt = new Date(currentPoll.closes_at).getTime();

  if (now < opensAt) {
    countdownElement.textContent =
      `Voting opens ${formatDate(currentPoll.opens_at)}`;

    voteButton.disabled = true;
    voteButton.textContent = "Poll Not Open";

    return;
  }

  const remaining = closesAt - now;

  if (
    remaining <= 0 ||
    currentPoll.status === "closed" ||
    currentPoll.status === "archived"
  ) {
    countdownElement.textContent =
      `Voting closed ${formatDate(
        currentPoll.closes_at
      )}`;

    voteButton.disabled = true;
    voteButton.textContent = "Voting Closed";

    disableOptions();

    if (countdownTimer) {
      clearInterval(countdownTimer);
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
    `Voting closes in ${days}d ${hours}h ` +
    `${minutes}m ${seconds}s`;
}

/* =========================================================
   DISPLAY HELPERS
   ========================================================= */

function disableOptions() {
  const radios = optionsElement.querySelectorAll(
    'input[type="radio"]'
  );

  radios.forEach((radio) => {
    radio.disabled = true;
  });
}

function setLoadingState() {
  questionElement.textContent = "Loading poll...";
  optionsElement.innerHTML = "";
  resultsElement.innerHTML = "";

  countdownElement.textContent = "Connecting...";

  voteButton.disabled = true;
  voteButton.textContent = "Vote";
}

function showNoPoll() {
  questionElement.textContent =
    "No active community poll";

  optionsElement.innerHTML = "";
  resultsElement.innerHTML = "";

  countdownElement.textContent =
    "Check back soon for the next question.";

  voteButton.disabled = true;
  voteButton.textContent = "No Poll Available";
}

function showSuccessMessage(message) {
  const success = document.createElement("div");

  success.className =
    "status-message success-message";

  success.textContent = message;

  resultsElement.prepend(success);
}

function showVoteError(message) {
  const oldError =
    resultsElement.querySelector(".error-message");

  if (oldError) {
    oldError.remove();
  }

  const error = document.createElement("div");

  error.className =
    "status-message error-message";

  error.textContent = message;

  resultsElement.prepend(error);
}

function showError(message) {
  questionElement.textContent = "Community Poll";
  optionsElement.innerHTML = "";
  resultsElement.innerHTML = "";

  const error = document.createElement("div");

  error.className =
    "status-message error-message";

  error.textContent = message;

  resultsElement.appendChild(error);

  countdownElement.textContent = "";

  voteButton.disabled = true;
  voteButton.textContent = "Unavailable";
}

function formatDate(dateValue) {
  const date = new Date(dateValue);

  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

/* =========================================================
   LIVE RESULTS REFRESH
   ========================================================= */

setInterval(async () => {
  if (
    currentPoll &&
    shouldShowResults()
  ) {
    await loadResults();
  }
}, 30000);

/* =========================================================
   START
   ========================================================= */

loadPoll();

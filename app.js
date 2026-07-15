"use strict";

const SUPABASE_URL = "https://leryhqzhrdkrfsdqbmch.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_TSAqo3OxVgP97n2b7yeQCw_zuBWltp8";

const CENTRAL_TIME_ZONE = "America/Chicago";

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);

const questionElement = document.getElementById("question");
const optionsElement = document.getElementById("options");
const voteButton = document.getElementById("voteButton");
const countdownElement = document.getElementById("countdown");
const resultsElement = document.getElementById("results");

let currentPoll = null;
let currentOptions = [];
let selectedOptionId = null;
let recordedOptionId = null;
let voterKey = null;
let countdownTimer = null;
let resultsRefreshTimer = null;

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
    let key = localStorage.getItem(storageName);

    if (!key) {
      key =
        window.crypto &&
        typeof window.crypto.randomUUID === "function"
          ? window.crypto.randomUUID()
          : createFallbackId();

      localStorage.setItem(storageName, key);
    }

    return key;
  } catch (error) {
    console.warn(
      "Local storage unavailable; using a temporary voter key.",
      error
    );

    return createFallbackId();
  }
}

function getTimeValue(value) {
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function isPollOpen() {
  if (!currentPoll) {
    return false;
  }

  const now = Date.now();

  return (
    now >= getTimeValue(currentPoll.opens_at) &&
    now < getTimeValue(currentPoll.closes_at) &&
    currentPoll.status !== "archived"
  );
}

function hasRecordedVote() {
  return recordedOptionId !== null;
}

function shouldDisplayResults() {
  if (!currentPoll) {
    return false;
  }

  return (
    currentPoll.show_live_results === true ||
    !isPollOpen() ||
    hasRecordedVote()
  );
}

async function initializePoll() {
  showLoadingState();
  voterKey = getVoterKey();

  try {
    await loadCurrentPoll();
  } catch (error) {
    console.error("Unable to initialize poll:", error);

    showFatalError(
      "The poll could not be loaded. Please try again shortly."
    );
  }
}

async function loadCurrentPoll() {
  const nowIso = new Date().toISOString();

  const activeResponse = await supabaseClient
    .from("polls")
    .select("*")
    .lte("opens_at", nowIso)
    .gt("closes_at", nowIso)
    .neq("status", "archived")
    .order("opens_at", { ascending: false })
    .limit(1);

  if (activeResponse.error) {
    throw activeResponse.error;
  }

  let poll = Array.isArray(activeResponse.data)
    ? activeResponse.data[0]
    : null;

  if (!poll) {
    const latestResponse = await supabaseClient
      .from("polls")
      .select("*")
      .lte("closes_at", nowIso)
      .neq("status", "archived")
      .order("closes_at", { ascending: false })
      .limit(1);

    if (latestResponse.error) {
      throw latestResponse.error;
    }

    poll = Array.isArray(latestResponse.data)
      ? latestResponse.data[0]
      : null;
  }

  if (!poll) {
    showNoPoll();
    return;
  }

  currentPoll = poll;

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

  await loadExistingVote();
  renderPoll();
  startCountdown();
  startResultsRefresh();

  if (shouldDisplayResults()) {
    await loadResults();
  }
}

async function loadExistingVote() {
  recordedOptionId = null;

  const response = await supabaseClient
    .from("votes")
    .select("option_id")
    .eq("poll_id", currentPoll.id)
    .eq("voter_key", voterKey)
    .maybeSingle();

  if (response.error) {
    throw response.error;
  }

  if (
    response.data &&
    response.data.option_id !== null &&
    response.data.option_id !== undefined
  ) {
    recordedOptionId = Number(response.data.option_id);
  }
}

function renderPoll() {
  questionElement.textContent = currentPoll.question;
  optionsElement.innerHTML = "";
  resultsElement.innerHTML = "";
  selectedOptionId = null;

  const pollOpen = isPollOpen();
  const alreadyVoted = hasRecordedVote();

  currentOptions.forEach(function (option) {
    const wrapper = document.createElement("div");
    wrapper.className = "option";

    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = "poll-option";
    radio.id = "option-" + option.id;
    radio.value = String(option.id);
    radio.disabled = !pollOpen || alreadyVoted;
    radio.checked =
      alreadyVoted &&
      recordedOptionId === Number(option.id);

    const label = document.createElement("label");
    label.htmlFor = radio.id;
    label.textContent = option.option_text;

    if (radio.checked) {
      wrapper.classList.add("your-vote");
      label.setAttribute("data-vote-label", "Your vote");
    }

    radio.addEventListener("change", function () {
      selectedOptionId = Number(option.id);
      updateVoteButtonState();
    });

    wrapper.appendChild(radio);
    wrapper.appendChild(label);
    optionsElement.appendChild(wrapper);
  });

  updateVoteButtonState();
}

function updateVoteButtonState() {
  if (!currentPoll || hasRecordedVote()) {
    voteButton.hidden = hasRecordedVote();
    voteButton.disabled = true;
    return;
  }

  voteButton.hidden = false;

  if (!isPollOpen()) {
    voteButton.disabled = true;
    voteButton.textContent = "Voting Closed";
    return;
  }

  voteButton.disabled = selectedOptionId === null;
  voteButton.textContent = "Vote";
}

voteButton.addEventListener("click", submitVote);

async function submitVote() {
  clearTemporaryMessages();

  if (
    !currentPoll ||
    selectedOptionId === null ||
    hasRecordedVote()
  ) {
    return;
  }

  if (!isPollOpen()) {
    updateVoteButtonState();
    await loadResults();
    return;
  }

  voteButton.disabled = true;
  voteButton.textContent = "Submitting...";

  try {
    const response = await supabaseClient.rpc(
      "cast_poll_vote",
      {
        p_poll_id: currentPoll.id,
        p_option_id: selectedOptionId,
        p_voter_key: voterKey
      }
    );

    if (response.error) {
      throw response.error;
    }

    recordedOptionId = selectedOptionId;

    renderPoll();
    await loadResults();

    showTemporaryMessage(
      "Your vote has been recorded.",
      "success-message"
    );
  } catch (error) {
    console.error("Unable to submit vote:", error);

    const message = String(
      error && error.message ? error.message : ""
    ).toLowerCase();

    if (
      message.includes("already voted") ||
      message.includes("duplicate")
    ) {
      await loadExistingVote();
      renderPoll();
      await loadResults();

      showTemporaryMessage(
        "Your vote was already recorded for this poll.",
        "success-message"
      );

      return;
    }

    voteButton.hidden = false;
    voteButton.disabled = false;
    voteButton.textContent = "Vote";

    showTemporaryMessage(
      "Your vote could not be submitted. Please try again.",
      "error-message"
    );
  }
}

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

    if (recordedOptionId === Number(option.id)) {
      row.classList.add("your-result");
    }

    const topLine = document.createElement("div");
    topLine.className = "result-topline";

    const optionName = document.createElement("span");
    optionName.textContent =
      option.option_text +
      (recordedOptionId === Number(option.id)
        ? " • Your Vote"
        : "");

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

    disableOptions();
    voteButton.hidden = true;
    return;
  }

  const remaining = closesAt - now;

  if (
    remaining <= 0 ||
    currentPoll.status === "archived"
  ) {
    countdownElement.textContent =
      "Voting closed " +
      formatDate(currentPoll.closes_at) +
      ". Next poll opens Monday.";

    voteButton.hidden = true;
    disableOptions();

    if (countdownTimer) {
      window.clearInterval(countdownTimer);
      countdownTimer = null;
    }

    loadResults();
    return;
  }

  const days = Math.floor(remaining / 86400000);
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
    "Voting closes Sunday at 11:59 PM CT • " +
    days +
    "d " +
    hours +
    "h " +
    minutes +
    "m " +
    seconds +
    "s remaining";
}

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

function disableOptions() {
  optionsElement
    .querySelectorAll('input[type="radio"]')
    .forEach(function (radio) {
      radio.disabled = true;
    });
}

function showLoadingState() {
  questionElement.textContent = "Loading poll...";
  optionsElement.innerHTML = "";
  resultsElement.innerHTML = "";
  countdownElement.textContent = "Loading...";
  voteButton.hidden = false;
  voteButton.disabled = true;
  voteButton.textContent = "Vote";
}

function showNoPoll() {
  questionElement.textContent =
    "No active community poll";

  optionsElement.innerHTML = "";
  resultsElement.innerHTML = "";
  countdownElement.textContent =
    "The next weekly poll opens Monday.";

  voteButton.hidden = true;
}

function showFatalError(message) {
  questionElement.textContent = "Community Poll";
  optionsElement.innerHTML = "";
  resultsElement.innerHTML = "";
  countdownElement.textContent = "";
  voteButton.hidden = true;

  const errorMessage = document.createElement("div");
  errorMessage.className =
    "status-message error-message";

  errorMessage.textContent = message;
  resultsElement.appendChild(errorMessage);
}

function clearTemporaryMessages() {
  resultsElement
    .querySelectorAll(
      ".success-message, .error-message"
    )
    .forEach(function (message) {
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

  return new Intl.DateTimeFormat("en-US", {
    timeZone: CENTRAL_TIME_ZONE,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short"
  }).format(date);
}

initializePoll();

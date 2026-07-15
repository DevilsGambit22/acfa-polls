import { ACFA_CONFIG } from "./config.js";
import * as api from "./api.js";
import { getBrowserKey, getTemplates, saveTemplate, clearTemplates } from "./storage.js";
import { buildMessage } from "./message-builder.js";

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const state = { openings: [], suggestions: [], locations: [], birthdays: [], shoutouts: [], survey: null, openingFilter: "All", outputMode: "html" };

const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
const voteCount = row => Number(row?.[0]?.count || 0);
const formatDate = value => new Intl.DateTimeFormat(undefined,{month:"short",day:"numeric",year:"numeric"}).format(new Date(value));

function toast(message, error = false) {
  const el = $("#toast"); el.textContent = message; el.className = `toast show${error ? " error" : ""}`;
  clearTimeout(toast.timer); toast.timer = setTimeout(() => el.className = "toast", 3200);
}
function friendlyError(error) {
  const msg = error?.message || String(error);
  if (msg.includes("duplicate key") || msg.includes("already")) return "You have already completed that action.";
  if (msg.includes("Failed to fetch")) return "The site could not reach Supabase. Check the project URL, key, and internet connection.";
  return msg;
}
function switchView(name) {
  $$(".view").forEach(v => v.classList.toggle("active", v.id === `view-${name}`));
  $$(".nav-button").forEach(b => b.classList.toggle("active", b.dataset.view === name));
  window.scrollTo({top:0,behavior:"smooth"});
}
function initializeNavigation() {
  $$(".nav-button").forEach(b => b.addEventListener("click", () => switchView(b.dataset.view)));
  $$("[data-jump]").forEach(b => b.addEventListener("click", () => switchView(b.dataset.jump)));
  $$("[data-modal]").forEach(b => b.addEventListener("click", () => document.getElementById(b.dataset.modal).showModal()));
  $$("[data-close]").forEach(b => b.addEventListener("click", () => document.getElementById(b.dataset.close).close()));
}
function initializeBirthdaySelects() {
  const month = $('#birthdayForm select[name="month"]'), day = $('#birthdayForm select[name="day"]');
  const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  months.forEach((m,i) => month.insertAdjacentHTML("beforeend", `<option value="${i+1}">${m}</option>`));
  for (let i=1;i<=31;i++) day.insertAdjacentHTML("beforeend", `<option value="${i}">${i}</option>`);
}
function setGreeting() {
  const hour = new Date().getHours();
  $("#greeting").textContent = `${hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening"}, ACFA`;
}
async function checkConnection() {
  try {
    await api.testConnection();
    $("#connectionDot").className = "connection-dot online";
    $("#connectionText").textContent = "Supabase connected";
  } catch (error) {
    $("#connectionDot").className = "connection-dot offline";
    $("#connectionText").textContent = "Supabase not connected";
    toast(friendlyError(error), true);
    throw error;
  }
}
function renderOpenings() {
  const rows = state.openings.filter(o => state.openingFilter === "All" || o.color === state.openingFilter);
  $("#openingsGrid").innerHTML = rows.length ? rows.map(o => `<article class="content-card">
    <div class="meta"><span class="badge">${escapeHtml(o.color)}</span><span class="badge">${escapeHtml(o.difficulty)}</span>${o.eco_code ? `<span class="badge">${escapeHtml(o.eco_code)}</span>` : ""}</div>
    <h3>${escapeHtml(o.opening_name)}</h3><p>${escapeHtml(o.recommendation)}</p>
    <small class="muted">Recommended by @${escapeHtml(o.username)}</small>
    <div class="card-actions"><button class="vote-button" data-opening-vote="${o.id}">▲ ${voteCount(o.acfa_opening_votes)}</button>
    ${o.resource_url ? `<a class="text-button" target="_blank" rel="noopener" href="${escapeHtml(o.resource_url)}">Learn more</a>` : ""}</div>
  </article>`).join("") : `<p class="empty">No approved openings in this category yet.</p>`;
}
function renderSuggestions() {
  $("#suggestionsGrid").innerHTML = state.suggestions.length ? state.suggestions.map(s => `<article class="content-card">
    <div class="meta"><span class="badge">${escapeHtml(s.category)}</span><span class="badge status-badge">${escapeHtml(s.status.replaceAll("_"," "))}</span></div>
    <h3>${escapeHtml(s.title)}</h3><p>${escapeHtml(s.description)}</p><small class="muted">Submitted by @${escapeHtml(s.username)}</small>
    <div class="card-actions"><button class="vote-button" data-suggestion-vote="${s.id}" ${s.status === "completed" ? "disabled" : ""}>▲ ${voteCount(s.acfa_suggestion_votes)}</button></div>
  </article>`).join("") : `<p class="empty">No approved suggestions are visible yet.</p>`;
}
function renderCommunity() {
  $("#locationsList").innerHTML = state.locations.length ? state.locations.slice(0,10).map(x => `<div class="list-item"><b>@${escapeHtml(x.username)}</b><p>${escapeHtml(x.region ? `${x.region}, ` : "")}${escapeHtml(x.country)}</p></div>`).join("") : `<p class="empty">No locations yet.</p>`;
  $("#birthdaysList").innerHTML = state.birthdays.length ? state.birthdays.slice(0,12).map(x => `<div class="list-item"><b>@${escapeHtml(x.username)}</b><p>${new Date(2000,x.birth_month-1,x.birth_day).toLocaleDateString(undefined,{month:"long",day:"numeric"})}</p></div>`).join("") : `<p class="empty">No birthdays yet.</p>`;
  $("#shoutoutsList").innerHTML = state.shoutouts.length ? state.shoutouts.map(x => `<div class="list-item"><b>@${escapeHtml(x.to_username)}</b><p>${escapeHtml(x.message)}</p><small>From @${escapeHtml(x.from_username)}</small></div>`).join("") : `<p class="empty">No approved shoutouts yet.</p>`;
}
function renderSurvey() {
  const intro = $("#surveyIntro"), form = $("#surveyForm");
  if (!state.survey) { intro.innerHTML = `<p class="empty">No survey is currently available.</p>`; form.classList.add("hidden"); return; }
  intro.innerHTML = `<p class="eyebrow">${escapeHtml(state.survey.status)}</p><h3>${escapeHtml(state.survey.title)}</h3><p>${escapeHtml(state.survey.description || "")}</p>`;
  form.classList.toggle("hidden", state.survey.status !== "open");
}
function renderStatsAndFeed() {
  $("#statOpenings").textContent = state.openings.length;
  $("#statSuggestions").textContent = state.suggestions.length;
  $("#statLocations").textContent = state.locations.length;
  $("#statShoutouts").textContent = state.shoutouts.length;
  const activity = [
    ...state.openings.slice(0,3).map(x => ({date:x.created_at,title:`New opening: ${x.opening_name}`,text:`Recommended by @${x.username}`})),
    ...state.suggestions.slice(0,3).map(x => ({date:x.created_at,title:`Suggestion: ${x.title}`,text:`Status: ${x.status.replaceAll("_"," ")}`})),
    ...state.shoutouts.slice(0,3).map(x => ({date:x.created_at,title:`Shoutout for @${x.to_username}`,text:`From @${x.from_username}`}))
  ].sort((a,b) => new Date(b.date)-new Date(a.date)).slice(0,7);
  $("#activityFeed").innerHTML = activity.length ? activity.map(x => `<div class="feed-item"><p><b>${escapeHtml(x.title)}</b></p><p>${escapeHtml(x.text)}</p><small>${formatDate(x.date)}</small></div>`).join("") : `<p class="empty">Community activity will appear here.</p>`;
  $("#lastRefresh").textContent = `Updated ${new Date().toLocaleTimeString([], {hour:"numeric",minute:"2-digit"})}`;
}
async function loadAll() {
  $("#refreshAllBtn").disabled = true;
  try {
    await checkConnection();
    const [openings,suggestions,locations,birthdays,shoutouts,survey] = await Promise.all([
      api.getOpenings(), api.getSuggestions(), api.getLocations(), api.getBirthdays(), api.getShoutouts(), api.getSurvey(ACFA_CONFIG.surveyKey)
    ]);
    Object.assign(state,{openings,suggestions,locations,birthdays,shoutouts,survey});
    renderOpenings(); renderSuggestions(); renderCommunity(); renderSurvey(); renderStatsAndFeed();
  } catch (error) {
    console.error(error);
  } finally { $("#refreshAllBtn").disabled = false; }
}
function bindForms() {
  $("#openingForm").addEventListener("submit", async e => {
    e.preventDefault(); const f = new FormData(e.currentTarget);
    try { await api.submitOpening(Object.fromEntries(f)); e.currentTarget.reset(); $("#openingModal").close(); toast("Opening submitted for approval."); }
    catch(error){ toast(friendlyError(error),true); }
  });
  $("#suggestionForm").addEventListener("submit", async e => {
    e.preventDefault(); const f = new FormData(e.currentTarget);
    try { await api.submitSuggestion(Object.fromEntries(f)); e.currentTarget.reset(); $("#suggestionModal").close(); toast("Suggestion submitted for approval."); }
    catch(error){ toast(friendlyError(error),true); }
  });
  $("#locationForm").addEventListener("submit", async e => {
    e.preventDefault(); const f = new FormData(e.currentTarget);
    try { await api.saveLocation({p_username:f.get("username"),p_country:f.get("country"),p_region:f.get("region"),p_editor_key:getBrowserKey("locationEditor")}); toast("Location saved."); state.locations=await api.getLocations(); renderCommunity(); renderStatsAndFeed(); }
    catch(error){ toast(friendlyError(error),true); }
  });
  $("#birthdayForm").addEventListener("submit", async e => {
    e.preventDefault(); const f = new FormData(e.currentTarget);
    try { await api.saveBirthday({p_username:f.get("username"),p_birth_month:Number(f.get("month")),p_birth_day:Number(f.get("day")),p_timezone:Intl.DateTimeFormat().resolvedOptions().timeZone,p_editor_key:getBrowserKey("birthdayEditor")}); toast("Birthday saved."); state.birthdays=await api.getBirthdays(); renderCommunity(); }
    catch(error){ toast(friendlyError(error),true); }
  });
  $("#shoutoutForm").addEventListener("submit", async e => {
    e.preventDefault(); const f = new FormData(e.currentTarget);
    try { await api.submitShoutout({...Object.fromEntries(f),status:"pending"}); e.currentTarget.reset(); toast("Shoutout submitted for approval."); }
    catch(error){ toast(friendlyError(error),true); }
  });
  $("#surveyForm").addEventListener("submit", async e => {
    e.preventDefault(); const f = new FormData(e.currentTarget);
    try { await api.submitSurvey({p_survey_key:ACFA_CONFIG.surveyKey,p_voter_key:getBrowserKey("surveyVoter"),p_username:f.get("username")||null,p_satisfaction:Number(f.get("satisfaction")),p_favorite_activity:f.get("favorite_activity")||null,p_improvement:f.get("improvement")||null,p_next_feature:f.get("next_feature")||null,p_answers:{}}); e.currentTarget.reset(); toast("Survey submitted. Thank you!"); }
    catch(error){ toast(friendlyError(error),true); }
  });
}
function bindVoting() {
  document.addEventListener("click", async e => {
    const openingId=e.target.closest("[data-opening-vote]")?.dataset.openingVote;
    const suggestionId=e.target.closest("[data-suggestion-vote]")?.dataset.suggestionVote;
    try {
      if(openingId){ await api.voteOpening(openingId,getBrowserKey("openingVoter")); state.openings=await api.getOpenings(); renderOpenings(); toast("Vote recorded."); }
      if(suggestionId){ await api.voteSuggestion(suggestionId,getBrowserKey("suggestionVoter")); state.suggestions=await api.getSuggestions(); renderSuggestions(); toast("Vote recorded."); }
    } catch(error){ toast(friendlyError(error),true); }
  });
}
function messageValues() {
  const f=new FormData($("#messageBuilderForm")); return {type:f.get("type"),headline:f.get("headline"),body:f.get("body"),buttonLabel:f.get("buttonLabel"),buttonUrl:f.get("buttonUrl"),discord:f.get("discord")==="on",twitch:f.get("twitch")==="on"};
}
function renderMessageOutput(){ $("#messageOutput").value=buildMessage(messageValues(),state.outputMode); }
function renderTemplates(){
  const templates=getTemplates();
  $("#templateList").innerHTML=templates.length?templates.map(t=>`<button class="list-item" data-template-id="${t.id}"><b>${escapeHtml(t.headline)}</b><p>${escapeHtml(t.type)}</p></button>`).join(""):`<p class="empty">No saved templates yet.</p>`;
}
function bindMessageBuilder(){
  $("#messageBuilderForm").addEventListener("submit",e=>{e.preventDefault();renderMessageOutput();});
  $$(".output-tab").forEach(b=>b.addEventListener("click",()=>{state.outputMode=b.dataset.output;$$(".output-tab").forEach(x=>x.classList.toggle("active",x===b));renderMessageOutput();}));
  $("#copyOutputBtn").addEventListener("click",async()=>{if(!$("#messageOutput").value)renderMessageOutput();await navigator.clipboard.writeText($("#messageOutput").value);toast("Message copied.");});
  $("#saveTemplateBtn").addEventListener("click",()=>{const v=messageValues();if(!v.headline||!v.body)return toast("Add a headline and message first.",true);saveTemplate(v);renderTemplates();toast("Template saved.");});
  $("#clearTemplatesBtn").addEventListener("click",()=>{clearTemplates();renderTemplates();toast("Templates cleared.");});
  $("#templateList").addEventListener("click",e=>{const id=e.target.closest("[data-template-id]")?.dataset.templateId;if(!id)return;const t=getTemplates().find(x=>x.id===id);if(!t)return;const f=$("#messageBuilderForm");Object.entries(t).forEach(([k,v])=>{const el=f.elements[k];if(!el)return;if(el.type==="checkbox")el.checked=Boolean(v);else el.value=v;});renderMessageOutput();});
}
function bindFilters(){
  $$("[data-opening-filter]").forEach(b=>b.addEventListener("click",()=>{state.openingFilter=b.dataset.openingFilter;$$("[data-opening-filter]").forEach(x=>x.classList.toggle("active",x===b));renderOpenings();}));
}
setGreeting(); initializeNavigation(); initializeBirthdaySelects(); bindForms(); bindVoting(); bindMessageBuilder(); bindFilters(); renderTemplates();
$("#refreshAllBtn").addEventListener("click",loadAll);
loadAll();

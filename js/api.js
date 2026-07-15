import { supabase, supabaseConfigured } from "./supabase-client.js";

function requireClient() {
  if (!supabaseConfigured || !supabase) {
    throw new Error("Supabase is not configured. Open js/config.js and add the project URL and anon key.");
  }
  return supabase;
}

export async function testConnection() {
  const client = requireClient();
  const { error } = await client.from("acfa_badges").select("id", { count: "exact", head: true });
  if (error) throw error;
  return true;
}

export async function getOpenings() {
  const { data, error } = await requireClient()
    .from("acfa_openings")
    .select("id,username,opening_name,color,difficulty,eco_code,recommendation,resource_url,created_at,acfa_opening_votes(count)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function submitOpening(payload) {
  const { error } = await requireClient().from("acfa_openings").insert({ ...payload, status: "pending" });
  if (error) throw error;
}

export async function voteOpening(openingId, voterKey) {
  const { error } = await requireClient().from("acfa_opening_votes").insert({ opening_id: openingId, voter_key: voterKey });
  if (error) throw error;
}

export async function getSuggestions() {
  const { data, error } = await requireClient()
    .from("acfa_suggestions")
    .select("id,username,category,title,description,status,created_at,acfa_suggestion_votes(count)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function submitSuggestion(payload) {
  const { error } = await requireClient().from("acfa_suggestions").insert({ ...payload, status: "pending" });
  if (error) throw error;
}

export async function voteSuggestion(suggestionId, voterKey) {
  const { error } = await requireClient().from("acfa_suggestion_votes").insert({ suggestion_id: suggestionId, voter_key: voterKey });
  if (error) throw error;
}

export async function getLocations() {
  const { data, error } = await requireClient().from("acfa_member_locations")
    .select("id,username,country,region,updated_at").order("updated_at", { ascending: false });
  if (error) throw error; return data || [];
}

export async function saveLocation(payload) {
  const { error } = await requireClient().rpc("acfa_save_location", payload);
  if (error) throw error;
}

export async function getBirthdays() {
  const { data, error } = await requireClient().from("acfa_birthdays")
    .select("id,username,birth_month,birth_day,timezone").order("birth_month").order("birth_day");
  if (error) throw error; return data || [];
}

export async function saveBirthday(payload) {
  const { error } = await requireClient().rpc("acfa_save_birthday", payload);
  if (error) throw error;
}

export async function getShoutouts() {
  const { data, error } = await requireClient().from("acfa_shoutouts")
    .select("id,from_username,to_username,message,created_at").order("created_at", { ascending: false }).limit(20);
  if (error) throw error; return data || [];
}

export async function submitShoutout(payload) {
  const { error } = await requireClient().from("acfa_shoutouts").insert({ ...payload, status: "pending" });
  if (error) throw error;
}

export async function getSurvey(surveyKey) {
  const { data, error } = await requireClient().from("acfa_surveys")
    .select("id,survey_key,title,description,status,opens_at,closes_at")
    .eq("survey_key", surveyKey).maybeSingle();
  if (error) throw error; return data;
}

export async function submitSurvey(payload) {
  const { error } = await requireClient().rpc("acfa_submit_survey_response", payload);
  if (error) throw error;
}

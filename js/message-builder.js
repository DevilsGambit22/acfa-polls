import { ACFA_CONFIG } from "./config.js";

const escapeHtml = value => String(value || "").replace(/[&<>"']/g, c => ({
  "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
})[c]);

const safeUrl = value => {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.href : ACFA_CONFIG.clubUrl;
  } catch { return ACFA_CONFIG.clubUrl; }
};

export function buildMessage(values, mode = "html") {
  const headline = values.headline.trim();
  const body = values.body.trim();
  const primaryLabel = values.buttonLabel.trim() || "Join ACFA Official";
  const primaryUrl = safeUrl(values.buttonUrl);
  const typeLabels = {
    announcement:"ACFA Official Announcement", invitation:"You’re Invited to ACFA",
    event:"ACFA Community Event", spotlight:"ACFA Member Spotlight", poll:"ACFA Community Poll"
  };
  const label = typeLabels[values.type] || "ACFA Official";

  if (mode === "plain") {
    return [
      label.toUpperCase(), "",
      headline, "",
      body, "",
      `${primaryLabel}: ${primaryUrl}`,
      values.discord ? `Join our Discord: ${ACFA_CONFIG.discordUrl}` : "",
      values.twitch ? `Watch ACFA live: ${ACFA_CONFIG.twitchUrl}` : "",
      "", "Every Player Belongs • Every Move Matters"
    ].filter((line, index, all) => line !== "" || all[index - 1] !== "").join("\n");
  }

  const buttons = [
    `<a href="${primaryUrl}" target="_blank" style="display:inline-block;margin:6px;padding:12px 18px;border-radius:12px;background:#d7ad4a;color:#171107;text-decoration:none;font-weight:900;">${escapeHtml(primaryLabel)}</a>`,
    values.discord ? `<a href="${safeUrl(ACFA_CONFIG.discordUrl)}" target="_blank" style="display:inline-block;margin:6px;padding:12px 18px;border-radius:12px;background:#5865F2;color:#fff;text-decoration:none;font-weight:900;">Join Discord</a>` : "",
    values.twitch ? `<a href="${safeUrl(ACFA_CONFIG.twitchUrl)}" target="_blank" style="display:inline-block;margin:6px;padding:12px 18px;border-radius:12px;background:#9146FF;color:#fff;text-decoration:none;font-weight:900;">Watch on Twitch</a>` : ""
  ].join("");

  return `<div style="width:100%;max-width:720px;margin:20px auto;overflow:hidden;border:2px solid #d7ad4a;border-radius:20px;background:#0b0a08;color:#f5f0e4;font-family:Arial,Helvetica,sans-serif;text-align:center;">
  <div style="padding:13px 18px;background:#d7ad4a;color:#171107;font-size:12px;font-weight:900;letter-spacing:2px;text-transform:uppercase;">${escapeHtml(label)}</div>
  <div style="padding:30px 22px;">
    <div style="color:#f0cf78;font-size:26px;font-weight:900;line-height:1.2;">${escapeHtml(headline)}</div>
    <div style="width:70px;height:2px;margin:18px auto;background:#d7ad4a;"></div>
    <div style="font-size:15px;line-height:1.7;white-space:pre-line;">${escapeHtml(body)}</div>
    <div style="margin-top:22px;">${buttons}</div>
    <div style="margin-top:22px;color:#bdb39d;font-size:12px;font-weight:700;">Every Player Belongs • Every Move Matters</div>
  </div>
</div>`;
}

(function(){
  const cfgOk = window.ACFA_SUPABASE_URL && !window.ACFA_SUPABASE_URL.includes('YOUR_') && window.ACFA_SUPABASE_KEY && !window.ACFA_SUPABASE_KEY.includes('YOUR_');
  window.acfaDb = cfgOk && window.supabase ? window.supabase.createClient(window.ACFA_SUPABASE_URL, window.ACFA_SUPABASE_KEY) : null;
  window.acfaEscape = (value='') => String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  window.acfaVoterKey = function(){
    const key='acfa_community_voter_key';
    let value=localStorage.getItem(key);
    if(!value){ value=(crypto.randomUUID?.() || `voter-${Date.now()}-${Math.random().toString(36).slice(2)}`); localStorage.setItem(key,value); }
    return value;
  };
  window.acfaSetStatus = function(message,type=''){
    const node=document.querySelector('[data-status]'); if(!node) return;
    node.className=`notice ${type}`.trim(); node.textContent=message; node.hidden=false;
  };
  window.acfaRequireDb = function(){
    if(window.acfaDb) return true;
    window.acfaSetStatus('Supabase is not configured yet. Add the Project URL and publishable key in shared/config.js.','error');
    return false;
  };
})();

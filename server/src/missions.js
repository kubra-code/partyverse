const WORDS = ["عدالة", "برهان", "شهادة", "كشري", "مفاجأة", "حقيقة", "مستحيل", "ظلم"];
const pick = (a) => a[Math.floor(Math.random() * a.length)];

export function pickMission(p, list) {
  const canVote = p.role !== "defendant";
  const others = list.filter((x) => x.id !== p.id && x.role !== "defendant");
  const types = ["chat_word", "raise_hand", "react3"];
  if (canVote) {
    types.push("vote_guilty", "vote_innocent");
    if (others.length) types.push("same_as", "opposite_of");
  }
  const type = pick(types);
  const m = { type, owner: p.id, done: false, count: 0, text: "" };
  if (type === "chat_word") {
    m.word = pick(WORDS);
    m.text = `اكتب كلمة «${m.word}» في الشات خلال الجولة`;
  } else if (type === "raise_hand") {
    m.text = "ارفع إيدك مرة واحدة على الأقل أثناء الدفاع";
  } else if (type === "react3") {
    m.text = "ابعت 3 تفاعلات (إيموجي) خلال الجولة";
  } else if (type === "vote_guilty") {
    m.text = "صوّت «مذنب» في الجولة دي";
  } else if (type === "vote_innocent") {
    m.text = "صوّت «بريء» في الجولة دي";
  } else {
    const t = pick(others);
    m.target = t.id;
    m.text = type === "same_as" ? `صوّت زي ${t.name} بالظبط` : `صوّت عكس ${t.name}`;
  }
  return m;
}

export function evaluateMission(m, votes, verdict) {
  const mine = votes.get(m.owner);
  if (m.type === "vote_guilty") m.done = mine === "guilty";
  else if (m.type === "vote_innocent") m.done = mine === "innocent";
  else if (m.type === "same_as") {
    const t = votes.get(m.target);
    m.done = !!mine && !!t && mine === t;
  } else if (m.type === "opposite_of") {
    const t = votes.get(m.target);
    m.done = !!mine && !!t && mine !== t;
  }
}

export const publicMission = (p) => (p.mission ? { text: p.mission.text, done: !!p.mission.done } : null);

export function trackChat(p, text) {
  const m = p.mission;
  if (m && m.type === "chat_word" && !m.done && String(text).includes(m.word)) {
    m.done = true;
    return true;
  }
  return false;
}

export function trackHand(p) {
  const m = p.mission;
  if (m && m.type === "raise_hand" && !m.done) {
    m.done = true;
    return true;
  }
  return false;
}

export function trackReaction(p) {
  const m = p.mission;
  if (m && m.type === "react3" && !m.done) {
    m.count += 1;
    if (m.count >= 3) {
      m.done = true;
      return true;
    }
  }
  return false;
}
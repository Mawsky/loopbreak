import { useState, useEffect, useRef, useCallback } from "react";

// ------------------------------------------------------------------
// LoopBreak v6 — a calm companion for post-ABI rumination
// v7: fifth sort — "Something that really happened" — for loss-shaped
//     rumination (grief, injustice, if-onlys) where the reality test
//     does not apply. Previously
// v6: version/copyright footer on the home screen
// v5: sorting step with four typed answers, Safety Box deferral,
//     Samaritans signpost, worry-box navigation fixes. Previously
// v4: appointment sentence-starters, send-to-nominee via share sheet,
//     Headway helpline signpost, guide served from loopbreak-guide.html
// Changes from v1 (per Brian's chapter-based enhancement brief):
//  P0  Muted text lightened to pass WCAG AAA on both surfaces
//  P1  Reassurance line on Circuit Breaker step 1
//  P1  "Just get today out of my head" freewrite, separate from Worry Box
//  P1  Appointment presets in Circuit Breaker step 3 + home banner
//  P1  Energy history as plain descriptive words (no colours, no scores)
//  P1  Physical task prompt library on Circuit Breaker step 4
//  P2  Box breathing runs for a chosen length, ends itself
//  P2  Occasional, gentle "tell someone" line after a Circuit Breaker run
//  +   Quiet footer link to the guide site
// ------------------------------------------------------------------

const C = {
  bg: "#182430",        // matte deep blue
  card: "#22323F",      // raised surface
  cardSoft: "#1D2B37",
  teal: "#63BAB1",      // primary action
  tealDim: "#3E7A74",
  text: "#D9DEDC",      // warm off-white
  textDim: "#B3C0C4",   // P0: was #93A3A8 — now 8.4:1 on bg, 7:1 on cards (AAA)
  amber: "#D8A45F",     // vault / locked
  coral: "#C98274",     // gentle warning
  line: "#2E3F4C",
};

const GUIDE_URL = "loopbreak-guide.html"; // lives beside the app on loopbreak.help
const VERSION = "7.0";
const VERSION_DATE = "12 July 2026";
const STORAGE_KEY = "loopbreak-v1"; // unchanged so existing data carries over

const emptyData = {
  draft: "",
  draftToday: "",
  worries: [],
  freewrites: [],
  energyLog: [],
  appointment: null, // { at: epoch ms }
  breakerRuns: 0,
  outcomes: [], // kept appointments: { id, worryText|null, outcome, at }
  draftOutcome: "",
  nominee: null, // the person worries can be sent to (a name, stored locally)
};

async function loadData() {
  try {
    const res = await window.storage.get(STORAGE_KEY);
    if (res && res.value) return { ...emptyData, ...JSON.parse(res.value) };
  } catch (e) {
    // no saved data yet — start fresh
  }
  return { ...emptyData };
}

async function persist(data) {
  try {
    await window.storage.set(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.error("Save failed", e);
  }
}

function fmtTime(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function fmtDay(ts) {
  return new Date(ts).toLocaleDateString([], { weekday: "long" });
}
function fmtDayTime(ts) {
  return new Date(ts).toLocaleDateString([], { weekday: "short", hour: "2-digit", minute: "2-digit" });
}
function fmtDayPart(ts) {
  const h = new Date(ts).getHours();
  const part = h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
  return `${fmtDay(ts)} ${part}`;
}
function minsLeft(ts) {
  return Math.max(0, Math.ceil((ts - Date.now()) / 60000));
}
function fmtAppointment(ts) {
  const d = new Date(ts);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const tomorrow = new Date(today.getTime() + 86400000).toDateString() === d.toDateString();
  const t = fmtTime(ts);
  if (sameDay) return `${t} today`;
  if (tomorrow) return `${t} tomorrow`;
  return `${t} on ${fmtDay(ts)}`;
}

// ---------------------------------------------------------------
// Shared UI pieces
// ---------------------------------------------------------------

function BigButton({ label, sub, icon, onClick, color = C.teal, textColor = "#10201E" }) {
  return (
    <button
      onClick={onClick}
      className="lb-big"
      style={{
        background: color,
        color: textColor,
        border: "none",
        borderRadius: 18,
        padding: "22px 20px",
        width: "100%",
        textAlign: "left",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: 16,
        minHeight: 84,
      }}
    >
      <span style={{ fontSize: 30, lineHeight: 1 }} aria-hidden="true">{icon}</span>
      <span>
        <span style={{ display: "block", fontSize: 20, fontWeight: 700 }}>{label}</span>
        {sub && <span style={{ display: "block", fontSize: 15, opacity: 0.92, marginTop: 4 }}>{sub}</span>}
      </span>
    </button>
  );
}

function QuietButton({ label, onClick, color = C.textDim }) {
  return (
    <button
      onClick={onClick}
      className="lb-quiet"
      style={{
        background: "transparent",
        color,
        border: `2px solid ${C.line}`,
        borderRadius: 14,
        padding: "14px 18px",
        fontSize: 17,
        cursor: "pointer",
        minHeight: 52,
      }}
    >
      {label}
    </button>
  );
}

function Screen({ title, onBack, backLabel = "← Home", children }) {
  return (
    <div style={{ maxWidth: 560, margin: "0 auto", padding: "20px 18px 48px" }}>
      <button
        onClick={onBack}
        className="lb-quiet"
        style={{
          background: "transparent",
          color: C.teal,
          border: "none",
          fontSize: 18,
          cursor: "pointer",
          padding: "10px 4px",
          marginBottom: 6,
          minHeight: 48,
        }}
      >
        {backLabel}
      </button>
      <h1 style={{ fontSize: 26, fontWeight: 700, margin: "4px 0 20px", color: C.text }}>{title}</h1>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------
// Home
// ---------------------------------------------------------------

function Home({ data, setData, go, startAppt }) {
  const hour = new Date().getHours();
  const greet = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const locked = data.worries.filter((w) => w.unlockAt > Date.now() && !w.safety).length;
  const parked = data.worries.filter((w) => w.unlockAt > Date.now() && w.safety).length;
  const ready = data.worries.filter((w) => w.unlockAt <= Date.now()).length;
  const appt = data.appointment;
  const apptDue = appt && appt.at <= Date.now();

  const clearAppt = () => setData((d) => ({ ...d, appointment: null }));

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", padding: "36px 18px 48px" }}>
      <p style={{ color: C.textDim, fontSize: 16, margin: 0 }}>{greet}.</p>
      <h1 style={{ fontSize: 30, fontWeight: 700, margin: "6px 0 6px", color: C.text }}>
        You're driving the bus.
      </h1>
      <p style={{ color: C.textDim, fontSize: 16, margin: "0 0 24px" }}>
        One tap. Nothing to remember.
      </p>

      {appt && !apptDue && (
        <div style={{ background: C.cardSoft, border: `2px solid ${C.line}`, borderRadius: 14, padding: "14px 18px", marginBottom: 18 }}>
          <p style={{ margin: 0, color: C.textDim, fontSize: 16, lineHeight: 1.6 }}>
            <span style={{ color: C.amber }}>📅 Check-in booked for {fmtAppointment(appt.at)}.</span>
            {" "}Until then, it's on the back burner.
          </p>
        </div>
      )}
      {appt && apptDue && (
        <div style={{ background: C.cardSoft, border: `2px solid ${C.line}`, borderRadius: 14, padding: "16px 18px", marginBottom: 18 }}>
          <p style={{ margin: "0 0 12px", color: C.text, fontSize: 16, lineHeight: 1.6 }}>
            📅 It's check-in time. Ten minutes, no more — say what's honest, then move on. Or, if it's lost its steam, just let it go. Both count as keeping the deal.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <button
              onClick={() => startAppt({ from: "home" })}
              className="lb-quiet"
              style={{ background: C.teal, color: "#10201E", border: "none", borderRadius: 12, padding: "14px 18px", fontSize: 17, fontWeight: 700, cursor: "pointer", minHeight: 52 }}
            >
              Have the appointment
            </button>
            <button
              onClick={clearAppt}
              className="lb-quiet"
              style={{ background: "transparent", color: C.textDim, border: `2px solid ${C.line}`, borderRadius: 12, padding: "12px 18px", fontSize: 16, cursor: "pointer", minHeight: 48 }}
            >
              It's lost its steam — let it go
            </button>
          </div>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <BigButton
          icon="🗣"
          label="Get a looping worry out of my head"
          sub="Write it down. It locks away for 2 hours."
          onClick={() => go("dump")}
        />
        <BigButton
          icon="📄"
          label="Just get today out of my head"
          sub="Empty the day's noise onto the page. No lock, no rules."
          color={C.card}
          textColor={C.text}
          onClick={() => go("today")}
        />
        <BigButton
          icon="⛓"
          label="Break the loop"
          sub="The 4-step circuit breaker, one step at a time."
          color={C.card}
          textColor={C.text}
          onClick={() => go("breaker")}
        />
        <BigButton
          icon="🌬"
          label="Ground me"
          sub="Breathing and the 5-4-3-2-1 reset."
          color={C.card}
          textColor={C.text}
          onClick={() => go("ground")}
        />
        <BigButton
          icon="🔋"
          label="Energy check"
          sub="Two taps. Low battery feeds the loop."
          color={C.card}
          textColor={C.text}
          onClick={() => go("energy")}
        />
      </div>

      <div style={{ marginTop: 26 }}>
        <button
          onClick={() => go("vault")}
          className="lb-quiet"
          style={{
            width: "100%",
            background: C.cardSoft,
            border: `2px solid ${C.line}`,
            borderRadius: 14,
            padding: "16px 18px",
            color: C.textDim,
            fontSize: 16,
            cursor: "pointer",
            textAlign: "left",
          }}
        >
          <span style={{ color: C.amber }}>🔒 Worry Box</span>
          {" — "}
          {locked === 0 && ready === 0 && parked === 0 && "empty. Good."}
          {locked > 0 && `${locked} locked away`}
          {locked > 0 && (parked > 0 || ready > 0) && ", "}
          {parked > 0 && `${parked} in the Safety Box`}
          {parked > 0 && ready > 0 && ", "}
          {ready > 0 && `${ready} ready if you still want ${ready === 1 ? "it" : "them"}`}
        </button>
      </div>

      <p style={{ textAlign: "center", marginTop: 30, marginBottom: 0 }}>
        <a
          href={GUIDE_URL}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: C.textDim, fontSize: 15, textDecoration: "underline", textUnderlineOffset: 3 }}
        >
          New here? Read Brian's guide to the loop
        </a>
      </p>
      <p style={{ textAlign: "center", marginTop: 16, marginBottom: 0, color: C.textDim, fontSize: 13, lineHeight: 1.7, opacity: 0.85 }}>
        LoopBreak · v{VERSION} · {VERSION_DATE}
        <br />
        © 2026{" "}
        <a href="https://mawsky.com" target="_blank" rel="noopener noreferrer" style={{ color: C.textDim, textDecoration: "underline", textUnderlineOffset: 3 }}>
          MawSky
        </a>
      </p>
    </div>
  );
}

// ---------------------------------------------------------------
// Worry dump + Worry Box (the 2-hour lock — unchanged flow)
// ---------------------------------------------------------------

function BrainDump({ data, setData, go }) {
  const [done, setDone] = useState(false);

  const update = (text) => {
    setData((d) => ({ ...d, draft: text })); // autosaves via App effect
  };

  const lockAway = () => {
    if (!data.draft.trim()) return;
    const worry = {
      id: Date.now().toString(36),
      text: data.draft.trim(),
      createdAt: Date.now(),
      unlockAt: Date.now() + 2 * 60 * 60 * 1000, // 2 hour lock
    };
    setData((d) => ({ ...d, draft: "", worries: [worry, ...d.worries] }));
    setDone(true);
  };

  if (done) {
    return (
      <Screen title="Locked away" onBack={() => go("home")}>
        <div style={{ background: C.card, borderRadius: 18, padding: 26, textAlign: "center" }}>
          <div style={{ fontSize: 46, marginBottom: 10 }}>🔒</div>
          <p style={{ fontSize: 20, color: C.text, margin: "0 0 8px", fontWeight: 600 }}>
            It's out of your head.
          </p>
          <p style={{ fontSize: 17, color: C.textDim, margin: 0, lineHeight: 1.6 }}>
            The box holds it for 2 hours so you can't spin on it. If it still matters later, it'll be waiting. It usually doesn't.
          </p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 22 }}>
          <BigButton icon="🌬" label="Ground me now" onClick={() => go("ground")} />
          <QuietButton label="Back to home" onClick={() => go("home")} />
        </div>
      </Screen>
    );
  }

  return (
    <Screen title="Get a looping worry out" onBack={() => go("home")}>
      <p style={{ color: C.textDim, fontSize: 16, lineHeight: 1.6, marginTop: 0 }}>
        Type the loop exactly as it sounds. No tidying up. Everything saves as you type.
      </p>
      <textarea
        value={data.draft}
        onChange={(e) => update(e.target.value)}
        placeholder="There's that old dog-eared loop again…"
        rows={7}
        style={{
          width: "100%",
          boxSizing: "border-box",
          background: C.cardSoft,
          border: `2px solid ${C.line}`,
          borderRadius: 14,
          color: C.text,
          fontSize: 18,
          lineHeight: 1.6,
          padding: 16,
          resize: "vertical",
          fontFamily: "inherit",
        }}
      />
      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 18 }}>
        <BigButton icon="🔒" label="Lock it in the box" sub="Held for 2 hours. Out of sight." onClick={lockAway} />
      </div>
    </Screen>
  );
}

function Vault({ data, setData, go, tick, startAppt }) {
  const [showDone, setShowDone] = useState(false);
  const release = (id) => setData((d) => ({ ...d, worries: d.worries.filter((w) => w.id !== id) }));
  const releaseOutcome = (id) => setData((d) => ({ ...d, outcomes: d.outcomes.filter((o) => o.id !== id) }));

  const locked = data.worries.filter((w) => w.unlockAt > Date.now());
  const ready = data.worries.filter((w) => w.unlockAt <= Date.now());

  return (
    <Screen title="Worry Box" onBack={() => go("home")}>
      {data.worries.length === 0 && (
        <div style={{ background: C.card, borderRadius: 18, padding: 26, textAlign: "center" }}>
          <p style={{ fontSize: 18, color: C.text, margin: 0 }}>The box is empty.</p>
          <p style={{ fontSize: 16, color: C.textDim, marginTop: 8 }}>That's a good day.</p>
        </div>
      )}

      {locked.filter((w) => w.safety).length > 0 && (
        <>
          <h2 style={{ fontSize: 17, color: C.teal, fontWeight: 600 }}>🛟 Safety Box — appointments with the future</h2>
          {locked.filter((w) => w.safety).map((w) => (
            <div key={w.id} style={{ background: C.card, borderRadius: 14, padding: 18, marginBottom: 12 }}>
              <p style={{ margin: "0 0 8px", color: C.teal, fontSize: 15, fontWeight: 600 }}>
                Parked until {fmtDayTime(w.unlockAt)} — to speak with {w.safety.who}
              </p>
              <p style={{ margin: "0 0 10px", color: C.text, fontSize: 17, lineHeight: 1.6 }}>{w.text}</p>
              <p style={{ margin: "0 0 14px", color: C.textDim, fontSize: 15, lineHeight: 1.6 }}>
                Take these words with you to that conversation — they're the worry, already written down.
              </p>
              <button
                onClick={() => release(w.id)}
                className="lb-quiet"
                style={{ background: "transparent", color: C.textDim, border: `2px solid ${C.line}`, borderRadius: 12, padding: "11px 16px", fontSize: 15, cursor: "pointer", minHeight: 46 }}
              >
                Sorted early — let it go
              </button>
            </div>
          ))}
        </>
      )}

      {locked.filter((w) => !w.safety).length > 0 && (
        <>
          <h2 style={{ fontSize: 17, color: C.amber, fontWeight: 600 }}>Locked — not for reading yet</h2>
          {locked.filter((w) => !w.safety).map((w) => (
            <div key={w.id} style={{ background: C.cardSoft, border: `2px solid ${C.line}`, borderRadius: 14, padding: 18, marginBottom: 12 }}>
              <p style={{ margin: 0, color: C.textDim, fontSize: 16 }}>
                🔒 Opens in about {minsLeft(w.unlockAt)} min ({fmtTime(w.unlockAt)})
              </p>
            </div>
          ))}
          <p style={{ color: C.textDim, fontSize: 15, lineHeight: 1.6 }}>
            Re-reading feeds the loop, so the words stay hidden until the lock opens.
          </p>
        </>
      )}

      {ready.length > 0 && (
        <>
          <h2 style={{ fontSize: 17, color: C.teal, fontWeight: 600, marginTop: 22 }}>Ready — if you still want them</h2>
          {ready.map((w) => (
            <div key={w.id} style={{ background: C.card, borderRadius: 14, padding: 18, marginBottom: 12 }}>
              <p style={{ margin: "0 0 6px", color: C.textDim, fontSize: 14 }}>
                {w.safety ? `🛟 Time's up — have you spoken to ${w.safety.who}?` : fmtDayTime(w.createdAt)}
              </p>
              <p style={{ margin: "0 0 14px", color: C.text, fontSize: 17, lineHeight: 1.6 }}>{w.text}</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <button
                  onClick={() => startAppt({ from: "vault", worry: w })}
                  className="lb-quiet"
                  style={{ background: C.teal, color: "#10201E", border: "none", borderRadius: 12, padding: "13px 18px", fontSize: 16, fontWeight: 700, cursor: "pointer", minHeight: 50 }}
                >
                  Have the appointment
                </button>
                <button
                  onClick={() => release(w.id)}
                  className="lb-quiet"
                  style={{ background: "transparent", color: C.textDim, border: `2px solid ${C.line}`, borderRadius: 12, padding: "12px 18px", fontSize: 16, cursor: "pointer", minHeight: 48 }}
                >
                  It's lost its steam — let it go
                </button>
              </div>
            </div>
          ))}
        </>
      )}

      {data.outcomes.length > 0 && (
        <div style={{ marginTop: 26 }}>
          <QuietButton
            label={showDone ? "Hide dealt-with" : `Dealt with (${data.outcomes.length})`}
            onClick={() => setShowDone(!showDone)}
          />
          {showDone && data.outcomes.map((o) => {
            const oSort = SORTS.find((s) => s.key === o.sort);
            return (
              <div key={o.id} style={{ background: C.cardSoft, border: `2px solid ${C.line}`, borderRadius: 14, padding: 18, marginTop: 14 }}>
                <p style={{ margin: "0 0 6px", color: C.textDim, fontSize: 14 }}>
                  {fmtDayTime(o.at)} — appointment kept{oSort ? ` · sorted as: ${oSort.label.toLowerCase()}` : ""}
                </p>
                {o.worryText && (
                  <p style={{ margin: "0 0 8px", color: C.textDim, fontSize: 15, lineHeight: 1.6 }}>The worry: {o.worryText}</p>
                )}
                <p style={{ margin: "0 0 10px", color: C.text, fontSize: 16, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                  {o.outcome ? o.outcome : "Faced it. Nothing more needed saying."}
                </p>
                {oSort && (
                  <p style={{ margin: "0 0 14px", color: C.textDim, fontSize: 15, lineHeight: 1.6 }}>
                    {oSort.icon} The answer still stands: {oSort.response}
                  </p>
                )}
                <button
                  onClick={() => releaseOutcome(o.id)}
                  className="lb-quiet"
                  style={{ background: "transparent", color: C.textDim, border: `2px solid ${C.line}`, borderRadius: 12, padding: "10px 16px", fontSize: 15, cursor: "pointer", minHeight: 44 }}
                >
                  Let it go
                </button>
              </div>
            );
          })}
        </div>
      )}
    </Screen>
  );
}

// ---------------------------------------------------------------
// "Just get today out of my head" — freewrite, no lock, no rules
// ---------------------------------------------------------------

function TodayDump({ data, setData, go }) {
  const [done, setDone] = useState(false);
  const [showPast, setShowPast] = useState(false);

  const update = (text) => setData((d) => ({ ...d, draftToday: text }));

  const save = () => {
    if (!data.draftToday.trim()) return;
    const page = { id: Date.now().toString(36), text: data.draftToday.trim(), at: Date.now() };
    setData((d) => ({ ...d, draftToday: "", freewrites: [page, ...d.freewrites].slice(0, 60) }));
    setDone(true);
  };

  const letGo = (id) => setData((d) => ({ ...d, freewrites: d.freewrites.filter((f) => f.id !== id) }));

  if (done) {
    return (
      <Screen title="It's out" onBack={() => go("home")}>
        <div style={{ background: C.card, borderRadius: 18, padding: 26, textAlign: "center" }}>
          <div style={{ fontSize: 46, marginBottom: 10 }}>📄</div>
          <p style={{ fontSize: 20, color: C.text, margin: "0 0 8px", fontWeight: 600 }}>
            The page is holding it now.
          </p>
          <p style={{ fontSize: 17, color: C.textDim, margin: 0, lineHeight: 1.6 }}>
            Nothing to fix, nothing to file. You can read it back any time, or never.
          </p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 22 }}>
          <BigButton icon="🏠" label="Back to home" onClick={() => go("home")} />
        </div>
      </Screen>
    );
  }

  return (
    <Screen title="Just get today out" onBack={() => go("home")}>
      <p style={{ color: C.textDim, fontSize: 16, lineHeight: 1.6, marginTop: 0 }}>
        Not a looping worry — just the day's noise. Spelling doesn't matter, order doesn't matter. It saves as you type.
      </p>
      <textarea
        value={data.draftToday}
        onChange={(e) => update(e.target.value)}
        placeholder="Today has been…"
        rows={8}
        style={{
          width: "100%",
          boxSizing: "border-box",
          background: C.cardSoft,
          border: `2px solid ${C.line}`,
          borderRadius: 14,
          color: C.text,
          fontSize: 18,
          lineHeight: 1.6,
          padding: 16,
          resize: "vertical",
          fontFamily: "inherit",
        }}
      />
      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 18 }}>
        <BigButton icon="📄" label="That's it out" sub="Saved. No lock — this one's just pages." onClick={save} />
        {data.freewrites.length > 0 && (
          <QuietButton
            label={showPast ? "Hide past pages" : `Read past pages (${data.freewrites.length})`}
            onClick={() => setShowPast(!showPast)}
          />
        )}
      </div>

      {showPast && data.freewrites.map((f) => (
        <div key={f.id} style={{ background: C.card, borderRadius: 14, padding: 18, marginTop: 14 }}>
          <p style={{ margin: "0 0 6px", color: C.textDim, fontSize: 14 }}>{fmtDayTime(f.at)}</p>
          <p style={{ margin: "0 0 14px", color: C.text, fontSize: 17, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{f.text}</p>
          <button
            onClick={() => letGo(f.id)}
            className="lb-quiet"
            style={{ background: "transparent", color: C.textDim, border: `2px solid ${C.line}`, borderRadius: 12, padding: "10px 16px", fontSize: 15, cursor: "pointer", minHeight: 44 }}
          >
            Let it go
          </button>
        </div>
      ))}
    </Screen>
  );
}

// ---------------------------------------------------------------
// Circuit Breaker — Brian's 4-step routine, one card at a time
// ---------------------------------------------------------------

const PIVOT_TASKS = [
  { icon: "☕", label: "Make a cup of tea" },
  { icon: "🚪", label: "Step outside for two minutes" },
  { icon: "🪴", label: "Water a plant" },
  { icon: "🚶", label: "Walk to the end of the street and back" },
  { icon: "🧺", label: "Put one thing back where it belongs" },
  { icon: "🪟", label: "Look out the window — count three things moving" },
];

function apptPresets() {
  const now = new Date();
  const inOneHour = now.getTime() + 60 * 60 * 1000;
  const evening = new Date(now);
  evening.setHours(20, 0, 0, 0);
  let eveningTs = evening.getTime();
  if (eveningTs <= now.getTime() + 15 * 60 * 1000) eveningTs += 86400000; // past 7:45pm → tomorrow evening
  const morning = new Date(now.getTime() + 86400000);
  morning.setHours(9, 0, 0, 0);
  return [
    { label: "In 1 hour", at: inOneHour },
    { label: eveningTs > now.getTime() + 86400000 * 0.6 && evening.getDate() !== now.getDate() ? "Tomorrow evening (8pm)" : "This evening (8pm)", at: eveningTs },
    { label: "Tomorrow morning (9am)", at: morning.getTime() },
  ];
}

function Breaker({ data, setData, go, startAppt, initialStep = 0 }) {
  const [i, setI] = useState(initialStep);
  const [booked, setBooked] = useState(null);
  const [finished, setFinished] = useState(false);
  const [pickedTask, setPickedTask] = useState(null);

  const book = (at) => {
    setData((d) => ({ ...d, appointment: { at } }));
    setBooked(at);
  };

  const finish = (task) => {
    setPickedTask(task || null);
    setData((d) => ({ ...d, breakerRuns: (d.breakerRuns || 0) + 1 }));
    setFinished(true);
  };

  if (finished) {
    // Occasional, gentle, non-recurring nudge — roughly every third completion
    const runs = (data.breakerRuns || 0);
    const showNudge = runs > 0 && runs % 3 === 0;
    return (
      <Screen title="Loop broken" onBack={() => go("home")}>
        <div style={{ background: C.card, borderRadius: 18, padding: 26, textAlign: "center" }}>
          <div style={{ fontSize: 46, marginBottom: 10 }}>{pickedTask ? pickedTask.icon : "✓"}</div>
          <p style={{ fontSize: 21, fontWeight: 700, color: C.text, margin: "0 0 8px", lineHeight: 1.4 }}>
            {pickedTask ? pickedTask.label + "." : "Off you go."}
          </p>
          <p style={{ fontSize: 17, color: C.textDim, margin: 0, lineHeight: 1.6 }}>
            Close the app and go do it. That's the win — the loop can't follow you there.
          </p>
        </div>
        {showNudge && (
          <p style={{ color: C.textDim, fontSize: 16, lineHeight: 1.6, textAlign: "center", marginTop: 20 }}>
            Might be worth telling someone how today went. No report needed — just a word.
          </p>
        )}
        <div style={{ marginTop: 20 }}>
          <QuietButton label="Back to home" onClick={() => go("home")} />
        </div>
      </Screen>
    );
  }

  const steps = [
    {
      title: "1 · Label the glitch",
      say: "\u201CThere's that old dog-eared loop again. This is just neurological static from an injured brain.\u201D",
      why: "Naming the mechanism creates distance. You are not the faulty data your brain is producing.",
      extra: "This loop isn't a failure of willpower. It's an alarm system stuck on after the injury — and stuck alarms can be interrupted.",
    },
    {
      title: "2 · Thought is not fact",
      say: "\u201CThis thought is purely imagined. The thought exists right now, but the fact never did. A thought cannot make anything happen.\u201D",
      why: "This dismantles thought-action fusion. Your alarm system gets told: you are completely safe.",
    },
    {
      title: "3 · Give it an appointment",
      say: "\u201CI'm safe to ignore this right now. If it still wants to talk, it can check in later — for ten minutes, no more.\u201D",
      why: "Fighting a thought feeds it. Booking it a specific, named time proves you're the one driving the bus. By then it's usually lost its steam.",
    },
    {
      title: "4 · Drop the mic and pivot",
      say: "One small physical thing, right now. Pick one — no deciding needed:",
      why: "An ABI brain can't run two intensive jobs at once. A real-world task starves the loop of processing power.",
    },
  ];

  const s = steps[i];

  return (
    <Screen title="Break the loop" onBack={() => go("home")}>
      <div style={{ background: C.card, borderRadius: 18, padding: 24 }}>
        <p style={{ color: C.teal, fontSize: 15, fontWeight: 700, letterSpacing: 0.5, margin: "0 0 12px", textTransform: "uppercase" }}>
          {s.title}
        </p>
        <p style={{ color: C.text, fontSize: 21, lineHeight: 1.55, margin: "0 0 18px", fontWeight: 600 }}>{s.say}</p>
        <p style={{ color: C.textDim, fontSize: 16, lineHeight: 1.6, margin: 0 }}>
          <strong style={{ color: C.text }}>Why it works: </strong>
          {s.why}
        </p>
        {s.extra && (
          <p style={{ color: C.textDim, fontSize: 16, lineHeight: 1.6, marginTop: 12, marginBottom: 0 }}>{s.extra}</p>
        )}
      </div>

      {/* Step 3: right now, or book it */}
      {i === 2 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 20 }}>
          {!booked && (
            <BigButton
              icon="🎙"
              label="Deal with it right now"
              sub="Sometimes now is the appointment. Say it straight."
              onClick={() => startAppt({ from: "breaker" })}
            />
          )}
          {!booked && apptPresets().map((p) => (
            <BigButton key={p.label} icon="📅" label={p.label} color={C.card} textColor={C.text} onClick={() => book(p.at)} />
          ))}
          {booked && (
            <div style={{ background: C.cardSoft, border: `2px solid ${C.line}`, borderRadius: 14, padding: "16px 18px" }}>
              <p style={{ margin: 0, color: C.text, fontSize: 17, lineHeight: 1.6 }}>
                📅 Booked for <strong>{fmtAppointment(booked)}</strong>. Deal made. Until then it's on the back burner — you'll see the check-in on the home screen.
              </p>
            </div>
          )}
          {!booked && (
            <BigButton icon="🔒" label="Or lock it in the Worry Box" sub="2-hour appointment, handled." color={C.amber} textColor="#241A0C" onClick={() => go("dump")} />
          )}
          <BigButton icon="→" label="Next step" onClick={() => setI(3)} />
          <QuietButton label="Back a step" onClick={() => setI(1)} />
        </div>
      )}

      {/* Step 4: pivot task prompts */}
      {i === 3 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 20 }}>
          {PIVOT_TASKS.map((t) => (
            <BigButton key={t.label} icon={t.icon} label={t.label} color={C.card} textColor={C.text} onClick={() => finish(t)} />
          ))}
          <BigButton icon="✓" label="I've got my own task" onClick={() => finish(null)} />
          <QuietButton label="Back a step" onClick={() => setI(2)} />
        </div>
      )}

      {/* Steps 1 and 2: plain next */}
      {i < 2 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 20 }}>
          <BigButton icon="→" label="Next step" onClick={() => setI(i + 1)} />
          {i > 0 && <QuietButton label="Back a step" onClick={() => setI(i - 1)} />}
        </div>
      )}

      <p style={{ textAlign: "center", color: C.textDim, fontSize: 14, marginTop: 18 }}>
        Step {i + 1} of 4
      </p>
    </Screen>
  );
}

// ---------------------------------------------------------------
// The Appointment — face it, be honest, sort it, get your answer
// ---------------------------------------------------------------

const STARTERS = [
  "What's true is…",
  "The story my brain added is…",
  "One thing I can actually do about it is…",
  "If a friend brought me this worry, I'd tell them…",
];

const SORTS = [
  {
    key: "ghost",
    icon: "👻",
    label: "An old ghost",
    sub: "It's about the past — and in all this time, it's never once come true.",
    response:
      "Run the numbers on it. How many mornings has this loop threatened you — and how many times has the feared thing actually happened? All those years of silence ARE the answer. If something was going to happen, it would have happened by now. This one is static, not signal: an alarm ringing over nothing. You can put it down.",
    caveat: "If part of you thinks it might genuinely still be live — or if the thing really did happen — be honest and sort it under one of the doors below instead.",
  },
  {
    key: "happened",
    icon: "🕯",
    label: "Something that really happened",
    sub: "A loss, a wrong, an 'if only' — a past that can't be changed.",
    response:
      "Then the reality test doesn't apply — this one is real, and no amount of looping can make it un-happen. That's the tell: this isn't a faulty alarm, it's grief wearing rumination's clothes, trying to solve something that was never a problem to solve. It's a loss to carry — and carrying is done with people, not alone at 3am. Put honest words on what was lost, then take them to someone: your person, Headway, a professional. Every hour the loop takes is an hour taken from living around it.",
    caveat: "If part of what happened still CAN be acted on — an apology, a claim, a conversation — that part is a real job. Give that bit its own appointment and sort it separately.",
  },
  {
    key: "job",
    icon: "🔧",
    label: "A real job",
    sub: "Something genuinely needs doing — and it's something I can do.",
    response:
      "Then this stops being a rumination the moment it becomes a task. Name the one next action — a call, a letter, a form, a conversation — and either do it now or give it a slot. A loop dies when the job leaves your head and lands on a list. Add the action as a late thought so it's written down, not carried.",
  },
  {
    key: "professional",
    icon: "🛟",
    label: "One for a professional",
    sub: "It can't be settled alone — it needs someone with the full picture.",
    response:
      "Then no amount of looping at 3am can settle it — because the answer doesn't live in your head, it lives with someone else. That's not a defeat, it's a diagnosis: this worry is simply waiting for the right conversation. Park it in the Safety Box with a date and a name, and it stops being an alarm and becomes an appointment with the future.",
  },
  {
    key: "fog",
    icon: "🌫",
    label: "Fog — I can't get the question out",
    sub: "Something feels wrong but the words won't come.",
    response:
      "That's the injury talking, not a fact. A worry that can't even state its case doesn't get to keep you up. Park it and rest the battery — the words often arrive on their own once the pressure's off. Or send it exactly as it is to your person; they may see what you can't from the inside.",
  },
];

function buildShareText(worryText, outcome) {
  const lines = ["From LoopBreak — a worry I've dealt with."];
  if (worryText) lines.push("", "The worry: " + worryText);
  if (outcome) lines.push("", "Where I got to: " + outcome);
  return lines.join("\n");
}

function safetyWhenPresets() {
  const day = 86400000;
  return [
    { label: "In 3 days", at: Date.now() + 3 * day },
    { label: "In a week", at: Date.now() + 7 * day },
    { label: "In two weeks", at: Date.now() + 14 * day },
  ];
}

function Appointment({ ctx, data, setData, go }) {
  // modes: talk -> sort -> response -> done
  //        (professional: response -> safety-when -> safety-who -> done)
  const [mode, setMode] = useState("talk");
  const [sortKey, setSortKey] = useState(null);
  const [savedId, setSavedId] = useState(null);
  const [secs, setSecs] = useState(0);
  const [usedStarters, setUsedStarters] = useState([]);
  const [askName, setAskName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [shared, setShared] = useState(null);
  const [safetyWhen, setSafetyWhen] = useState(null);
  const [whoDraft, setWhoDraft] = useState("");
  const [askWho, setAskWho] = useState(false);
  const [parkedInfo, setParkedInfo] = useState(null);

  useEffect(() => {
    const id = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const minsIn = Math.floor(secs / 60);
  const overTime = minsIn >= 10;
  const sort = SORTS.find((s) => s.key === sortKey);

  const update = (t) => setData((d) => ({ ...d, draftOutcome: t }));

  const addStarter = (idx) => {
    setUsedStarters((u) => (u.includes(idx) ? u : [...u, idx]));
    setData((d) => {
      const cur = d.draftOutcome || "";
      const joiner = cur.trim() ? "\n\n" : "";
      return { ...d, draftOutcome: cur + joiner + STARTERS[idx] + " " };
    });
  };

  const saveNominee = () => {
    const n = nameDraft.trim();
    if (!n) return;
    setData((d) => ({ ...d, nominee: n }));
    setAskName(false);
  };

  const sendToNominee = async () => {
    const o = data.outcomes.find((x) => x.id === savedId);
    const text = buildShareText(ctx.worry ? ctx.worry.text : null, o ? o.outcome : "");
    try {
      if (navigator.share) {
        await navigator.share({ text });
        setShared("sent");
      } else {
        await navigator.clipboard.writeText(text);
        setShared("copied");
      }
    } catch (e) {
      // user cancelled the share sheet — that's fine, no failure state
    }
  };

  // Close out for ghost / job / fog — saves the outcome with its sort
  const finish = (key) => {
    const text = (data.draftOutcome || "").trim();
    const now = Date.now();
    if (savedId) {
      setData((d) => ({
        ...d,
        draftOutcome: "",
        outcomes: d.outcomes.map((o) => (o.id === savedId ? { ...o, outcome: text, at: now } : o)),
      }));
    } else {
      const id = now.toString(36);
      setSavedId(id);
      setData((d) => ({
        ...d,
        draftOutcome: "",
        outcomes: [
          { id, worryText: ctx.worry ? ctx.worry.text : null, outcome: text, sort: key, at: now },
          ...d.outcomes,
        ].slice(0, 60),
        worries: ctx.worry ? d.worries.filter((w) => w.id !== ctx.worry.id) : d.worries,
        appointment: ctx.from === "home" ? null : d.appointment,
      }));
    }
    setMode("done");
  };

  // Close out for professional — parks a Safety Box entry with a date and a name
  const finishSafety = (who) => {
    const text = (data.draftOutcome || "").trim();
    const now = Date.now();
    const id = now.toString(36);
    const worryText = ctx.worry ? ctx.worry.text : text || "A worry parked for the right conversation";
    setSavedId(id);
    setParkedInfo({ who, at: safetyWhen });
    setData((d) => ({
      ...d,
      draftOutcome: "",
      outcomes: [
        { id, worryText: ctx.worry ? ctx.worry.text : null, outcome: text, sort: "professional", at: now },
        ...d.outcomes,
      ].slice(0, 60),
      worries: [
        { id: id + "s", text: worryText, createdAt: now, unlockAt: safetyWhen, safety: { who } },
        ...(ctx.worry ? d.worries.filter((w) => w.id !== ctx.worry.id) : d.worries),
      ],
      appointment: ctx.from === "home" ? null : d.appointment,
    }));
    setMode("done");
  };

  const addThought = () => {
    const o = data.outcomes.find((x) => x.id === savedId);
    setData((d) => ({ ...d, draftOutcome: o ? o.outcome : "" }));
    setSortKey(null);
    setMode("talk");
  };

  // ------------------------------------------------ done
  if (mode === "done") {
    return (
      <Screen title={parkedInfo ? "Parked in the Safety Box" : "Appointment kept"} onBack={() => go("home")}>
        <div style={{ background: C.card, borderRadius: 18, padding: 26, textAlign: "center" }}>
          <div style={{ fontSize: 46, marginBottom: 10 }}>{parkedInfo ? "🛟" : "🤝"}</div>
          {parkedInfo ? (
            <>
              <p style={{ fontSize: 20, color: C.text, margin: "0 0 8px", fontWeight: 600 }}>
                An appointment with the future.
              </p>
              <p style={{ fontSize: 17, color: C.textDim, margin: 0, lineHeight: 1.6 }}>
                Parked until {fmtDayTime(parkedInfo.at)} — because by then you'll have spoken to {parkedInfo.who}. It's safe in the box, words and all, ready to take to that conversation. Your half of the deal is to leave it there.
              </p>
            </>
          ) : (
            <>
              <p style={{ fontSize: 20, color: C.text, margin: "0 0 8px", fontWeight: 600 }}>
                Deal kept. You have your answer.
              </p>
              <p style={{ fontSize: 17, color: C.textDim, margin: 0, lineHeight: 1.6 }}>
                You looked at it straight, sorted it, and answered it. It's saved under "Dealt with" in the Worry Box — answer and all — if you ever want to read it back.
              </p>
            </>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 22 }}>
          <BigButton
            icon="→"
            label="Now pivot"
            sub="One small physical thing — the loop can't follow you there."
            onClick={() => go("breaker4")}
          />

          {data.nominee && !askName && (
            <BigButton
              icon="📤"
              label={shared === "sent" ? `Sent to ${data.nominee} ✓` : shared === "copied" ? "Copied — paste it to them ✓" : `Send to ${data.nominee}`}
              sub={shared ? "Off your chest and into good hands." : "The worry and where you got to — for a real reader."}
              color={C.card}
              textColor={C.text}
              onClick={sendToNominee}
            />
          )}

          {!data.nominee && !askName && (
            <QuietButton label="Send this to someone" onClick={() => setAskName(true)} />
          )}

          {askName && (
            <div style={{ background: C.cardSoft, border: `2px solid ${C.line}`, borderRadius: 14, padding: 18 }}>
              <p style={{ margin: "0 0 10px", color: C.text, fontSize: 17, lineHeight: 1.6 }}>
                Who's your person? A friend, family member, therapist — whoever should read these. Just their name; it stays on this device.
              </p>
              <input
                type="text"
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                placeholder="e.g. Steve, or 'my therapist'"
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  background: C.bg,
                  border: `2px solid ${C.line}`,
                  borderRadius: 12,
                  color: C.text,
                  fontSize: 17,
                  padding: "13px 14px",
                  fontFamily: "inherit",
                  marginBottom: 12,
                }}
              />
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <button
                  onClick={saveNominee}
                  className="lb-quiet"
                  style={{ background: C.teal, color: "#10201E", border: "none", borderRadius: 12, padding: "13px 18px", fontSize: 16, fontWeight: 700, cursor: "pointer", minHeight: 50 }}
                >
                  That's my person
                </button>
                <button
                  onClick={() => setAskName(false)}
                  className="lb-quiet"
                  style={{ background: "transparent", color: C.textDim, border: `2px solid ${C.line}`, borderRadius: 12, padding: "11px 18px", fontSize: 15, cursor: "pointer", minHeight: 46 }}
                >
                  Not now
                </button>
              </div>
            </div>
          )}

          <QuietButton label="Open the Worry Box" onClick={() => go("vault")} />
          <QuietButton label="A late thought? Add it" onClick={addThought} />
          <QuietButton label="Back to home" onClick={() => go("home")} />

          <p style={{ color: C.textDim, fontSize: 15, lineHeight: 1.7, margin: "8px 0 0", textAlign: "center" }}>
            No one to send it to? Headway's free, confidential helpline is run by people who understand brain injury:{" "}
            <a href="tel:08088002244" style={{ color: C.teal, textDecoration: "underline", textUnderlineOffset: 3 }}>0808 800 2244</a>
            {" "}(Mon–Fri, 9–5).
          </p>
          {data.nominee && !askName && (
            <button
              onClick={() => { setNameDraft(data.nominee); setAskName(true); }}
              className="lb-quiet"
              style={{ background: "transparent", color: C.textDim, border: "none", fontSize: 14, cursor: "pointer", padding: 8, textDecoration: "underline", textUnderlineOffset: 3 }}
            >
              Change who this goes to
            </button>
          )}
        </div>
      </Screen>
    );
  }

  // ------------------------------------------------ safety box: when
  if (mode === "safety-when") {
    return (
      <Screen title="The Safety Box" onBack={() => setMode("response")} backLabel="← Back">
        <p style={{ color: C.textDim, fontSize: 16, lineHeight: 1.6, marginTop: 0 }}>
          Parked until when? Give yourself enough time to have the conversation — the box will hold it, words and all.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {safetyWhenPresets().map((p) => (
            <BigButton
              key={p.label}
              icon="🛟"
              label={p.label}
              color={C.card}
              textColor={C.text}
              onClick={() => { setSafetyWhen(p.at); setMode("safety-who"); }}
            />
          ))}
        </div>
      </Screen>
    );
  }

  // ------------------------------------------------ safety box: who
  if (mode === "safety-who") {
    const whoOptions = ["My GP", "Headway", data.nominee || "My person"];
    return (
      <Screen title="The Safety Box" onBack={() => setMode("safety-when")} backLabel="← Back">
        <p style={{ color: C.textDim, fontSize: 16, lineHeight: 1.6, marginTop: 0 }}>
          And who will you speak to by then? Naming them is what turns this from a worry into an appointment.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {!askWho && whoOptions.map((w) => (
            <BigButton key={w} icon="🗣" label={w} color={C.card} textColor={C.text} onClick={() => finishSafety(w)} />
          ))}
          {!askWho && <QuietButton label="Someone else…" onClick={() => setAskWho(true)} />}
          {askWho && (
            <div style={{ background: C.cardSoft, border: `2px solid ${C.line}`, borderRadius: 14, padding: 18 }}>
              <input
                type="text"
                value={whoDraft}
                onChange={(e) => setWhoDraft(e.target.value)}
                placeholder="e.g. my neuropsychologist"
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  background: C.bg,
                  border: `2px solid ${C.line}`,
                  borderRadius: 12,
                  color: C.text,
                  fontSize: 17,
                  padding: "13px 14px",
                  fontFamily: "inherit",
                  marginBottom: 12,
                }}
              />
              <button
                onClick={() => whoDraft.trim() && finishSafety(whoDraft.trim())}
                className="lb-quiet"
                style={{ background: C.teal, color: "#10201E", border: "none", borderRadius: 12, padding: "13px 18px", fontSize: 16, fontWeight: 700, cursor: "pointer", minHeight: 50, width: "100%" }}
              >
                Park it with them
              </button>
            </div>
          )}
        </div>
      </Screen>
    );
  }

  // ------------------------------------------------ response
  if (mode === "response" && sort) {
    return (
      <Screen title={sort.label} onBack={() => setMode("sort")} backLabel="← Sort it differently">
        <div style={{ background: C.card, borderRadius: 18, padding: 24 }}>
          <div style={{ fontSize: 40, marginBottom: 10 }} aria-hidden="true">{sort.icon}</div>
          <p style={{ color: C.text, fontSize: 19, lineHeight: 1.65, margin: 0, fontWeight: 500 }}>{sort.response}</p>
          {sort.caveat && (
            <p style={{ color: C.textDim, fontSize: 15, lineHeight: 1.6, marginTop: 14, marginBottom: 0 }}>{sort.caveat}</p>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 20 }}>
          {sort.key === "professional" ? (
            <>
              <BigButton icon="🛟" label="Park it in the Safety Box" sub="A date, a name, and it's off your watch." onClick={() => setMode("safety-when")} />
              <QuietButton label="Move on without parking it" onClick={() => finish(sort.key)} />
            </>
          ) : (
            <BigButton icon="🤝" label="That's my answer — move on" sub="Keeping your half of the deal." onClick={() => finish(sort.key)} />
          )}
        </div>
      </Screen>
    );
  }

  // ------------------------------------------------ sort
  if (mode === "sort") {
    return (
      <Screen title="What kind of worry is it?" onBack={() => setMode("talk")} backLabel="← Back to the words">
        <p style={{ color: C.textDim, fontSize: 16, lineHeight: 1.6, marginTop: 0 }}>
          Look at what you've written. The answer depends on what kind of worry this is — and you're the one who knows. Sort it:
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {SORTS.map((s) => (
            <BigButton
              key={s.key}
              icon={s.icon}
              label={s.label}
              sub={s.sub}
              color={C.card}
              textColor={C.text}
              onClick={() => { setSortKey(s.key); setMode("response"); }}
            />
          ))}
        </div>
      </Screen>
    );
  }

  // ------------------------------------------------ talk
  return (
    <Screen title="The appointment" onBack={() => go("home")}>
      {ctx.worry && (
        <div style={{ background: C.cardSoft, border: `2px solid ${C.line}`, borderRadius: 14, padding: 18, marginBottom: 16 }}>
          <p style={{ margin: "0 0 6px", color: C.textDim, fontSize: 14 }}>What you locked away:</p>
          <p style={{ margin: 0, color: C.text, fontSize: 17, lineHeight: 1.6 }}>{ctx.worry.text}</p>
        </div>
      )}
      <p style={{ color: C.textDim, fontSize: 16, lineHeight: 1.6, marginTop: 0 }}>
        This is its slot — ten minutes, no more. Look at it straight and be honest. Tap a starter and finish the sentence — no blank page to face. It saves as you type.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 14 }}>
        {STARTERS.map((st, idx) => {
          const used = usedStarters.includes(idx);
          return (
            <button
              key={idx}
              onClick={() => addStarter(idx)}
              className="lb-quiet"
              style={{
                background: used ? "transparent" : C.card,
                color: used ? C.textDim : C.text,
                border: `2px solid ${used ? C.line : C.tealDim}`,
                borderRadius: 12,
                padding: "13px 16px",
                fontSize: 16,
                textAlign: "left",
                cursor: "pointer",
                minHeight: 50,
                opacity: used ? 0.7 : 1,
              }}
            >
              {used ? "✓ " : "+ "}{st}
            </button>
          );
        })}
      </div>
      <textarea
        value={data.draftOutcome}
        onChange={(e) => update(e.target.value)}
        placeholder="Looking at it straight…"
        rows={8}
        style={{
          width: "100%",
          boxSizing: "border-box",
          background: C.cardSoft,
          border: `2px solid ${C.line}`,
          borderRadius: 14,
          color: C.text,
          fontSize: 18,
          lineHeight: 1.6,
          padding: 16,
          resize: "vertical",
          fontFamily: "inherit",
        }}
      />
      <p style={{ color: C.textDim, fontSize: 15, lineHeight: 1.6, margin: "10px 0 0" }}>
        {overTime
          ? "Time's about up. Say the last honest thing and close it — anything left over can book another slot."
          : `About ${10 - minsIn} minutes on the clock. No rush inside it.`}
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 18 }}>
        <BigButton
          icon="🤝"
          label="Honest words down — now sort it"
          sub="The answer depends on what kind of worry it is."
          onClick={() => setMode("sort")}
        />
      </div>
      <p style={{ color: C.textDim, fontSize: 14, lineHeight: 1.7, margin: "18px 0 0", textAlign: "center" }}>
        If this worry is about hurting yourself or not wanting to be here, it's not one for an app or a box — Samaritans are there to listen, any hour, free:{" "}
        <a href="tel:116123" style={{ color: C.teal, textDecoration: "underline", textUnderlineOffset: 3 }}>116 123</a>.
      </p>
    </Screen>
  );
}

// ---------------------------------------------------------------
// Grounding: menu, timed Box Breathing, 5-4-3-2-1
// ---------------------------------------------------------------

function GroundMenu({ go }) {
  return (
    <Screen title="Ground me" onBack={() => go("home")}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <BigButton icon="◻" label="Box breathing" sub="4 in · 4 hold · 4 out · 4 hold. Eyes can stay closed." onClick={() => go("breathe")} />
        <BigButton icon="👁" label="5-4-3-2-1 reset" sub="Back into the room, one sense at a time." color={C.card} textColor={C.text} onClick={() => go("senses")} />
      </div>
    </Screen>
  );
}

const PHASES = [
  { label: "Breathe in", secs: 4, scale: 1 },
  { label: "Hold", secs: 4, scale: 1 },
  { label: "Breathe out", secs: 4, scale: 0.55 },
  { label: "Hold", secs: 4, scale: 0.55 },
];

const BREATHE_LENGTHS = [
  { label: "About a minute", cycles: 4 },
  { label: "About 3 minutes", cycles: 11 },
  { label: "About 5 minutes", cycles: 19 },
];

function Breathe({ go }) {
  const [target, setTarget] = useState(null); // cycles chosen
  const [cycle, setCycle] = useState(0);
  const [phase, setPhase] = useState(0);
  const [count, setCount] = useState(4);
  const [done, setDone] = useState(false);
  const reduced = typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    if (target === null || done) return;
    const id = setInterval(() => {
      setCount((c) => {
        if (c > 1) return c - 1;
        setPhase((p) => {
          const np = (p + 1) % 4;
          if (navigator.vibrate) navigator.vibrate(np % 2 === 0 ? [80, 60, 80] : 120);
          if (np === 0) {
            setCycle((cy) => {
              const ncy = cy + 1;
              if (ncy >= target) setDone(true);
              return ncy;
            });
          }
          return np;
        });
        return 4;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [target, done]);

  if (done) {
    return (
      <Screen title="Box breathing" onBack={() => go("ground")} backLabel="← Ground me">
        <div style={{ background: C.card, borderRadius: 18, padding: 30, textAlign: "center" }}>
          <div style={{ fontSize: 46, marginBottom: 10 }}>🌿</div>
          <p style={{ fontSize: 21, fontWeight: 700, color: C.text, margin: "0 0 8px" }}>Done. Back to steady.</p>
          <p style={{ fontSize: 16, color: C.textDim, margin: 0, lineHeight: 1.6 }}>
            It finished itself — nothing to get right, nothing to keep going.
          </p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 20 }}>
          <BigButton icon="🏠" label="Back to home" onClick={() => go("home")} />
          <QuietButton label="Ground me menu" onClick={() => go("ground")} />
        </div>
      </Screen>
    );
  }

  if (target === null) {
    return (
      <Screen title="Box breathing" onBack={() => go("ground")} backLabel="← Ground me">
        <p style={{ color: C.textDim, fontSize: 16, lineHeight: 1.6, marginTop: 0 }}>
          How long? It stops itself when it's done — you don't need to watch a clock.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {BREATHE_LENGTHS.map((b) => (
            <BigButton
              key={b.label}
              icon="◻"
              label={b.label}
              color={C.card}
              textColor={C.text}
              onClick={() => {
                setTarget(b.cycles);
                setCycle(0);
                setPhase(0);
                setCount(4);
                if (navigator.vibrate) navigator.vibrate(80);
              }}
            />
          ))}
        </div>
        <p style={{ color: C.textDim, fontSize: 15, lineHeight: 1.6, marginTop: 18 }}>
          On phones that support it, you'll feel a buzz at each change — so your eyes can stay closed.
        </p>
      </Screen>
    );
  }

  const p = PHASES[phase];

  return (
    <Screen title="Box breathing" onBack={() => go("ground")} backLabel="← Ground me">
      <div style={{ background: C.card, borderRadius: 18, padding: 30, textAlign: "center" }}>
        <div
          aria-hidden="true"
          style={{
            width: 150,
            height: 150,
            margin: "0 auto 24px",
            borderRadius: 28,
            border: `3px solid ${C.tealDim}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              width: 110,
              height: 110,
              borderRadius: 20,
              background: C.teal,
              opacity: 0.9,
              transform: `scale(${p.scale})`,
              transition: reduced ? "none" : "transform 3.6s ease-in-out",
            }}
          />
        </div>
        <p style={{ fontSize: 26, fontWeight: 700, color: C.text, margin: "0 0 6px" }}>{p.label}</p>
        <p style={{ fontSize: 44, fontWeight: 700, color: C.teal, margin: 0, fontVariantNumeric: "tabular-nums" }}>{count}</p>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 20 }}>
        <QuietButton label="Stop early — I'm steadier now" onClick={() => setDone(true)} />
      </div>
    </Screen>
  );
}

const SENSE_STEPS = [
  { n: 5, verb: "see", icon: "👁", hint: "Look around slowly. Name each one out loud." },
  { n: 4, verb: "touch", icon: "✋", hint: "The chair, your sleeve, the table. Feel each one." },
  { n: 3, verb: "hear", icon: "👂", hint: "Near sounds and far sounds both count." },
  { n: 2, verb: "smell", icon: "👃", hint: "Or two smells you like, from memory." },
  { n: 1, verb: "taste", icon: "👅", hint: "Or take one slow sip of a drink." },
];

function Senses({ go }) {
  const [i, setI] = useState(0);
  if (i >= SENSE_STEPS.length) {
    return (
      <Screen title="5-4-3-2-1 reset" onBack={() => go("ground")} backLabel="← Ground me">
        <div style={{ background: C.card, borderRadius: 18, padding: 30, textAlign: "center" }}>
          <div style={{ fontSize: 46, marginBottom: 10 }}>🌿</div>
          <p style={{ fontSize: 21, fontWeight: 700, color: C.text, margin: "0 0 8px" }}>You're back in the room.</p>
          <p style={{ fontSize: 16, color: C.textDim, margin: 0, lineHeight: 1.6 }}>The loop needed your attention to keep spinning. It didn't get it.</p>
        </div>
        <div style={{ marginTop: 20 }}>
          <BigButton icon="🏠" label="Back to home" onClick={() => go("home")} />
        </div>
      </Screen>
    );
  }
  const s = SENSE_STEPS[i];
  return (
    <Screen title="5-4-3-2-1 reset" onBack={() => go("ground")} backLabel="← Ground me">
      <div style={{ background: C.card, borderRadius: 18, padding: 30, textAlign: "center" }}>
        <div style={{ fontSize: 44, marginBottom: 8 }} aria-hidden="true">{s.icon}</div>
        <p style={{ fontSize: 24, fontWeight: 700, color: C.text, margin: "0 0 10px", lineHeight: 1.4 }}>
          Name <span style={{ color: C.teal }}>{s.n}</span> {s.n === 1 ? "thing" : "things"} you can {s.verb}
        </p>
        <p style={{ fontSize: 16, color: C.textDim, margin: 0, lineHeight: 1.6 }}>{s.hint}</p>
      </div>
      <div style={{ marginTop: 20 }}>
        <BigButton icon="✓" label={`Done — ${i === SENSE_STEPS.length - 1 ? "finish" : "next"}`} onClick={() => setI(i + 1)} />
      </div>
      <p style={{ textAlign: "center", color: C.textDim, fontSize: 14, marginTop: 18 }}>
        Step {i + 1} of {SENSE_STEPS.length}
      </p>
    </Screen>
  );
}

// ---------------------------------------------------------------
// Energy tracker — history is a record, never a report card
// ---------------------------------------------------------------

function Energy({ data, setData, go }) {
  const [logged, setLogged] = useState(null);

  const log = (level) => {
    setData((d) => ({ ...d, energyLog: [{ level, at: Date.now() }, ...d.energyLog].slice(0, 60) }));
    setLogged(level);
  };

  const recent = data.energyLog.slice(0, 7);

  return (
    <Screen title="Energy check" onBack={() => go("home")}>
      {!logged && (
        <>
          <p style={{ color: C.textDim, fontSize: 16, lineHeight: 1.6, marginTop: 0 }}>
            How's the battery right now? No sliders, no scores. One tap.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <BigButton icon="🪫" label="Low" sub="Foggy, heavy, running on fumes." color={C.card} textColor={C.text} onClick={() => log("low")} />
            <BigButton icon="🔋" label="Charging" sub="Getting there. Steady." color={C.card} textColor={C.text} onClick={() => log("charging")} />
            <BigButton icon="⚡" label="Full" sub="Clear-headed and good to go." color={C.card} textColor={C.text} onClick={() => log("full")} />
          </div>
        </>
      )}

      {logged === "low" && (
        <div style={{ background: C.card, borderRadius: 18, padding: 26 }}>
          <p style={{ fontSize: 20, fontWeight: 700, color: C.text, margin: "0 0 10px" }}>Battery is low.</p>
          <p style={{ fontSize: 17, color: C.text, lineHeight: 1.6, margin: 0 }}>
            Low battery is when loops bite hardest — it's the fuel they run on. Close the app and rest for 15 minutes. No screens if you can manage it. That's not giving up, that's maintenance.
          </p>
        </div>
      )}
      {logged === "charging" && (
        <div style={{ background: C.card, borderRadius: 18, padding: 26 }}>
          <p style={{ fontSize: 20, fontWeight: 700, color: C.text, margin: "0 0 10px" }}>Charging. Noted.</p>
          <p style={{ fontSize: 17, color: C.text, lineHeight: 1.6, margin: 0 }}>
            Keep tasks light. If a loop shows up while you're at half power, don't argue with it — lock it in the box.
          </p>
        </div>
      )}
      {logged === "full" && (
        <div style={{ background: C.card, borderRadius: 18, padding: 26 }}>
          <p style={{ fontSize: 20, fontWeight: 700, color: C.text, margin: "0 0 10px" }}>Full battery. Logged.</p>
          <p style={{ fontSize: 17, color: C.text, lineHeight: 1.6, margin: 0 }}>
            Good time for the things that need a clear head. Enjoy it.
          </p>
        </div>
      )}

      {logged && (
        <div style={{ marginTop: 20 }}>
          <BigButton icon="🏠" label="Back to home" onClick={() => go("home")} />
        </div>
      )}

      {recent.length > 0 && (
        <div style={{ marginTop: 28 }}>
          <h2 style={{ fontSize: 16, color: C.textDim, fontWeight: 600, marginBottom: 4 }}>The last few check-ins</h2>
          <p style={{ fontSize: 14, color: C.textDim, margin: "0 0 10px" }}>Just a record, not a report card. Sometimes a pattern shows itself.</p>
          {recent.map((e, idx) => (
            <p key={idx} style={{ color: C.text, fontSize: 16, margin: 0, padding: "9px 0", borderBottom: `1px solid ${C.line}` }}>
              {fmtDayPart(e.at)}: <span style={{ textTransform: "capitalize" }}>{e.level}</span>
            </p>
          ))}
        </div>
      )}
    </Screen>
  );
}

// ---------------------------------------------------------------
// App shell
// ---------------------------------------------------------------

export default function App() {
  const [view, setView] = useState("home");
  const [apptCtx, setApptCtx] = useState(null);
  const [data, setDataState] = useState(emptyData);
  const [loaded, setLoaded] = useState(false);
  const [tick, setTick] = useState(0);
  const saveTimer = useRef(null);

  useEffect(() => {
    loadData().then((d) => {
      setDataState(d);
      setLoaded(true);
    });
  }, []);

  // gentle clock for vault countdowns and the appointment banner
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(id);
  }, []);

  // debounced autosave on any data change
  const setData = useCallback((updater) => {
    setDataState((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => persist(next), 600);
      return next;
    });
  }, []);

  const go = (v) => setView(v);
  const startAppt = (ctx) => {
    setApptCtx(ctx);
    setView("appt");
  };

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", fontSize: 17, lineHeight: 1.5 }}>
      <style>{`
        button:focus-visible { outline: 3px solid ${C.teal}; outline-offset: 3px; }
        textarea:focus-visible { outline: 3px solid ${C.teal}; outline-offset: 2px; border-color: transparent; }
        a:focus-visible { outline: 3px solid ${C.teal}; outline-offset: 3px; }
        .lb-big:active { transform: scale(0.985); }
        @media (prefers-reduced-motion: reduce) {
          .lb-big:active { transform: none; }
        }
        ::placeholder { color: ${C.textDim}; opacity: 0.75; }
      `}</style>

      {!loaded && (
        <div style={{ maxWidth: 560, margin: "0 auto", padding: "60px 18px", textAlign: "center", color: C.textDim, fontSize: 17 }}>
          Opening your space…
        </div>
      )}

      {loaded && view === "home" && <Home data={data} setData={setData} go={go} startAppt={startAppt} />}
      {loaded && view === "dump" && <BrainDump data={data} setData={setData} go={go} />}
      {loaded && view === "today" && <TodayDump data={data} setData={setData} go={go} />}
      {loaded && view === "vault" && <Vault data={data} setData={setData} go={go} tick={tick} startAppt={startAppt} />}
      {loaded && view === "breaker" && <Breaker data={data} setData={setData} go={go} startAppt={startAppt} />}
      {loaded && view === "breaker4" && <Breaker data={data} setData={setData} go={go} startAppt={startAppt} initialStep={3} />}
      {loaded && view === "appt" && apptCtx && <Appointment ctx={apptCtx} data={data} setData={setData} go={go} />}
      {loaded && view === "ground" && <GroundMenu go={go} />}
      {loaded && view === "breathe" && <Breathe go={go} />}
      {loaded && view === "senses" && <Senses go={go} />}
      {loaded && view === "energy" && <Energy data={data} setData={setData} go={go} />}
    </div>
  );
}

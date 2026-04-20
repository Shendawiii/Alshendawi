// ═══════════════════════════════════════════════════════════════════════════
//  BRAINWAVE — MVP Game Logic
//  Real-time multiplayer trivia with unique-answer scoring.
//
//  CONFIGURATION — paste your Supabase keys here (see README Step 4)
// ═══════════════════════════════════════════════════════════════════════════

const SUPABASE_URL = 'https://mcvzhmjiltgejeiszgdc.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1jdnpobWppbHRnZWplaXN6Z2RjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY2ODY1MjIsImV4cCI6MjA5MjI2MjUyMn0.kJSTtQYHSCTXD-0eSTkLYhy06byT5XX3AFKYu0f0uCI';

const QUESTIONS_PER_GAME = 10;
const PREVIEW_MS = 4000;   // question preview (no input)
const ANSWER_MS  = 10000;  // answer phase
const RESULTS_MS = 8000;   // show results between questions

// ═══════════════════════════════════════════════════════════════════════════
//  STATE
// ═══════════════════════════════════════════════════════════════════════════

const state = {
  supabase: null,
  questions: [],
  roomId: null,
  roomCode: null,
  playerId: null,
  playerName: '',
  isHost: false,
  room: null,
  players: [],
  myAnswer: null,
};

let channel = null;
let countdownInterval = null;
let hostTransitionTimer = null;

// ═══════════════════════════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function $(id) { return document.getElementById(id); }

function showScreen(name) {
  ['home','lobby','game','final'].forEach(s => {
    $('screen-' + s).classList.toggle('hidden', s !== name);
  });
}

function showError(msg) {
  const e = $('home-error');
  e.textContent = msg;
  e.classList.remove('hidden');
  setTimeout(() => e.classList.add('hidden'), 4000);
}

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/I/1 confusion
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function normalize(text) {
  return (text || '')
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ');
}

// Fuzzy correctness check: exact match or within Fuse.js threshold
function isCorrect(userAnswer, canonical) {
  const u = normalize(userAnswer);
  const c = normalize(canonical);
  if (!u) return false;
  if (u === c) return true;
  // Allow small typos via Fuse
  const fuse = new Fuse([c], { includeScore: true, threshold: 0.3 });
  const results = fuse.search(u);
  return results.length > 0 && results[0].score < 0.3;
}

function updateLobbyLink() {
  const base = location.origin + location.pathname;
  const link = `${base}?code=${state.roomCode}`;
  $('lobby-link').textContent = link;
}

// ═══════════════════════════════════════════════════════════════════════════
//  INITIALIZATION
// ═══════════════════════════════════════════════════════════════════════════

async function init() {
  if (SUPABASE_URL.includes('PASTE_YOUR') || SUPABASE_KEY.includes('PASTE_YOUR')) {
    showError('Setup needed: edit app.js and paste your Supabase URL + key (see README Step 4)');
    return;
  }

  state.supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

  try {
    const res = await fetch('questions.json');
    state.questions = await res.json();
  } catch (e) {
    showError('Could not load questions.json');
    return;
  }

  // Pre-fill room code from URL ?code=XXXXXX
  const params = new URLSearchParams(location.search);
  const code = params.get('code');
  if (code) $('input-code').value = code.toUpperCase();

  wireEvents();
  showScreen('home');
}

function wireEvents() {
  $('btn-create').onclick      = createRoom;
  $('btn-join').onclick        = joinRoom;
  $('btn-start').onclick       = startGame;
  $('btn-submit').onclick      = submitAnswer;
  $('btn-leave').onclick       = leaveRoom;
  $('btn-play-again').onclick  = playAgain;
  $('btn-new').onclick         = () => { location.href = location.pathname; };

  $('game-answer').addEventListener('keypress', e => {
    if (e.key === 'Enter') submitAnswer();
  });

  $('lobby-link').onclick = async () => {
    try {
      await navigator.clipboard.writeText($('lobby-link').textContent);
      const orig = $('lobby-link').textContent;
      $('lobby-link').textContent = '✓ Copied!';
      setTimeout(() => $('lobby-link').textContent = orig, 1500);
    } catch (e) { /* clipboard may be blocked */ }
  };
}

// ═══════════════════════════════════════════════════════════════════════════
//  CREATE ROOM
// ═══════════════════════════════════════════════════════════════════════════

async function createRoom() {
  const name = $('input-name').value.trim();
  if (!name) { showError('Enter your name first'); return; }

  state.playerName = name;

  // Randomly select questions for this game
  const shuffled = [...state.questions].sort(() => Math.random() - 0.5);
  const selected = shuffled.slice(0, QUESTIONS_PER_GAME);

  // Try a few times to get a unique 6-char room code
  let room = null;
  let lastError = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCode();
    const { data, error } = await state.supabase
      .from('rooms')
      .insert({
        code,
        host_name: name,
        status: 'waiting',
        phase: 'lobby',
        current_q: -1,
        questions: selected,
      })
      .select()
      .single();
    if (!error) { room = data; break; }
    lastError = error;
  }

  if (!room) {
    showError('Could not create room: ' + (lastError?.message || 'unknown'));
    return;
  }

  state.roomId = room.id;
  state.roomCode = room.code;
  state.room = room;

  const { data: player, error: pErr } = await state.supabase
    .from('players')
    .insert({ room_id: room.id, name, is_host: true })
    .select()
    .single();

  if (pErr) { showError('Could not register player: ' + pErr.message); return; }

  state.playerId = player.id;
  state.isHost = true;

  await subscribeToRoom();
  showScreen('lobby');
  renderLobby();
  updateLobbyLink();
}

// ═══════════════════════════════════════════════════════════════════════════
//  JOIN ROOM
// ═══════════════════════════════════════════════════════════════════════════

async function joinRoom() {
  const name = $('input-name').value.trim();
  const code = $('input-code').value.trim().toUpperCase();

  if (!name) { showError('Enter your name first'); return; }
  if (!code || code.length !== 6) { showError('Enter a 6-letter room code'); return; }

  const { data: room, error } = await state.supabase
    .from('rooms')
    .select('*')
    .eq('code', code)
    .maybeSingle();

  if (error || !room) { showError('Room not found'); return; }
  if (room.status !== 'waiting') { showError('Game already started — ask host for new room'); return; }

  state.roomId = room.id;
  state.roomCode = room.code;
  state.room = room;
  state.playerName = name;

  const { data: player, error: pErr } = await state.supabase
    .from('players')
    .insert({ room_id: room.id, name, is_host: false })
    .select()
    .single();

  if (pErr) { showError('Could not join: ' + pErr.message); return; }

  state.playerId = player.id;
  state.isHost = false;

  await subscribeToRoom();
  showScreen('lobby');
  renderLobby();
  updateLobbyLink();
}

// ═══════════════════════════════════════════════════════════════════════════
//  REALTIME SUBSCRIPTIONS
// ═══════════════════════════════════════════════════════════════════════════

async function subscribeToRoom() {
  await refreshPlayers();

  if (channel) await channel.unsubscribe();

  channel = state.supabase.channel(`room:${state.roomId}`)
    .on('postgres_changes',
        { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${state.roomId}` },
        payload => {
          state.room = payload.new;
          handleRoomUpdate();
        })
    .on('postgres_changes',
        { event: '*', schema: 'public', table: 'players', filter: `room_id=eq.${state.roomId}` },
        async () => {
          await refreshPlayers();
          if (state.room?.phase === 'lobby') renderLobby();
          else if (state.room?.phase === 'results') renderResults();
          else if (state.room?.phase === 'final')   renderFinal();
        })
    .on('postgres_changes',
        { event: '*', schema: 'public', table: 'answers', filter: `room_id=eq.${state.roomId}` },
        () => {
          if (state.room?.phase === 'results') renderResults();
        })
    .subscribe();
}

async function refreshPlayers() {
  const { data } = await state.supabase
    .from('players')
    .select('*')
    .eq('room_id', state.roomId)
    .order('score', { ascending: false })
    .order('name');
  state.players = data || [];
}

function handleRoomUpdate() {
  const phase = state.room.phase;
  if (phase === 'lobby') {
    showScreen('lobby');
    renderLobby();
  } else if (['preview','answer','results'].includes(phase)) {
    showScreen('game');
    renderGame();
  } else if (phase === 'final') {
    showScreen('final');
    renderFinal();
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  LOBBY
// ═══════════════════════════════════════════════════════════════════════════

function renderLobby() {
  $('lobby-code').textContent = state.roomCode;

  const ul = $('lobby-players');
  ul.innerHTML = '';
  state.players.forEach(p => {
    const li = document.createElement('li');
    li.textContent = p.name;
    if (p.is_host) li.classList.add('host-badge');
    ul.appendChild(li);
  });

  const startBtn = $('btn-start');
  const waitMsg  = $('lobby-wait-msg');
  if (state.isHost) {
    startBtn.classList.remove('hidden');
    waitMsg.classList.add('hidden');
    startBtn.disabled = state.players.length < 1;
    startBtn.textContent = state.players.length < 2
      ? 'Start Game (solo — add friends first for more fun)'
      : `Start Game (${state.players.length} players)`;
  } else {
    startBtn.classList.add('hidden');
    waitMsg.classList.remove('hidden');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  GAME FLOW (host-driven phase transitions)
// ═══════════════════════════════════════════════════════════════════════════

async function startGame() {
  if (!state.isHost) return;
  await transitionPhase('preview', 0);
}

async function transitionPhase(phase, currentQ) {
  await state.supabase
    .from('rooms')
    .update({
      phase,
      current_q: currentQ,
      phase_start: new Date().toISOString(),
      status: phase === 'final' ? 'finished' : 'playing',
    })
    .eq('id', state.roomId);
}

function scheduleHostTransition(ms, callback) {
  if (hostTransitionTimer) clearTimeout(hostTransitionTimer);
  const startTime = new Date(state.room.phase_start).getTime();
  const elapsed = Date.now() - startTime;
  const delay = Math.max(100, ms - elapsed);
  hostTransitionTimer = setTimeout(callback, delay);
}

function renderGame() {
  const { phase, current_q, phase_start, questions } = state.room;
  const q = questions[current_q];

  $('game-progress').textContent = `Question ${current_q + 1} / ${questions.length}`;
  $('game-question').textContent = q.q;

  startCountdown(phase_start, phase);

  const inputWrap  = $('game-input-wrap');
  const resultWrap = $('game-result-wrap');
  const input      = $('game-answer');
  const submitBtn  = $('btn-submit');

  if (phase === 'preview') {
    inputWrap.classList.remove('hidden');
    resultWrap.classList.add('hidden');
    input.value = '';
    input.disabled = true;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Get Ready…';
    state.myAnswer = null;

    if (state.isHost) scheduleHostTransition(PREVIEW_MS, async () => {
      await transitionPhase('answer', current_q);
    });
  } else if (phase === 'answer') {
    inputWrap.classList.remove('hidden');
    resultWrap.classList.add('hidden');
    if (state.myAnswer === null) {
      input.disabled = false;
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit Answer';
      input.focus();
    }

    if (state.isHost) scheduleHostTransition(ANSWER_MS, async () => {
      await scoreRound(current_q);
      await transitionPhase('results', current_q);
    });
  } else if (phase === 'results') {
    inputWrap.classList.add('hidden');
    resultWrap.classList.remove('hidden');
    renderResults();

    if (state.isHost) scheduleHostTransition(RESULTS_MS, async () => {
      const nextQ = current_q + 1;
      if (nextQ >= questions.length) {
        await transitionPhase('final', current_q);
      } else {
        await transitionPhase('preview', nextQ);
      }
    });
  }
}

function startCountdown(phase_start, phase) {
  if (countdownInterval) clearInterval(countdownInterval);
  const durations = { preview: PREVIEW_MS, answer: ANSWER_MS, results: RESULTS_MS };
  const duration = durations[phase] || 0;
  const startTime = new Date(phase_start).getTime();
  const endTime = startTime + duration;
  const timerEl = $('game-timer');

  const tick = () => {
    const remaining = Math.max(0, endTime - Date.now());
    const seconds = Math.ceil(remaining / 1000);
    timerEl.textContent = seconds;
    timerEl.classList.toggle('urgent', seconds <= 3 && phase === 'answer');
    if (remaining <= 0) clearInterval(countdownInterval);
  };
  tick();
  countdownInterval = setInterval(tick, 100);
}

// ═══════════════════════════════════════════════════════════════════════════
//  SUBMIT ANSWER
// ═══════════════════════════════════════════════════════════════════════════

async function submitAnswer() {
  if (state.myAnswer !== null) return;
  if (state.room.phase !== 'answer') return;

  const text = $('game-answer').value.trim();
  const q = state.room.questions[state.room.current_q];
  const correct = isCorrect(text, q.canonical);
  const canonical = correct ? q.canonical : normalize(text);

  // Lock UI immediately for responsiveness
  state.myAnswer = { text, correct, canonical };
  $('game-answer').disabled = true;
  $('btn-submit').disabled = true;
  $('btn-submit').textContent = '✓ Locked';

  await state.supabase.from('answers').insert({
    room_id: state.roomId,
    player_id: state.playerId,
    question_index: state.room.current_q,
    answer_text: text,
    canonical,
    is_correct: correct,
    scored: false,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
//  SCORING (host only, runs when answer phase ends)
// ═══════════════════════════════════════════════════════════════════════════

async function scoreRound(qIndex) {
  // Fill in empty answers for players who didn't submit
  const { data: submitted } = await state.supabase
    .from('answers')
    .select('player_id')
    .eq('room_id', state.roomId)
    .eq('question_index', qIndex);

  const submittedIds = new Set((submitted || []).map(a => a.player_id));
  const missing = state.players.filter(p => !submittedIds.has(p.id));
  if (missing.length > 0) {
    await state.supabase.from('answers').insert(
      missing.map(p => ({
        room_id: state.roomId,
        player_id: p.id,
        question_index: qIndex,
        answer_text: '',
        canonical: '',
        is_correct: false,
        scored: false,
      }))
    );
  }

  // Fetch all answers for this round
  const { data: all } = await state.supabase
    .from('answers')
    .select('*')
    .eq('room_id', state.roomId)
    .eq('question_index', qIndex);

  // Count canonicals among correct answers
  const counts = {};
  (all || []).filter(a => a.is_correct).forEach(a => {
    counts[a.canonical] = (counts[a.canonical] || 0) + 1;
  });

  // Score unique correct answers
  for (const a of (all || [])) {
    if (a.is_correct && counts[a.canonical] === 1 && !a.scored) {
      await state.supabase.from('answers').update({ scored: true }).eq('id', a.id);
      const player = state.players.find(p => p.id === a.player_id);
      if (player) {
        await state.supabase
          .from('players')
          .update({ score: player.score + 1 })
          .eq('id', a.player_id);
      }
    }
  }

  await refreshPlayers();
}

// ═══════════════════════════════════════════════════════════════════════════
//  RESULTS SCREEN
// ═══════════════════════════════════════════════════════════════════════════

async function renderResults() {
  if (state.room.phase !== 'results') return;

  const qIndex = state.room.current_q;
  const q = state.room.questions[qIndex];

  const { data: answers } = await state.supabase
    .from('answers')
    .select('*')
    .eq('room_id', state.roomId)
    .eq('question_index', qIndex);

  const myAns = (answers || []).find(a => a.player_id === state.playerId);
  const banner = $('result-banner');
  const reason = $('result-reason');

  if (myAns && myAns.scored) {
    banner.textContent = 'BRAVO';
    banner.className = 'result-banner bravo';
    reason.textContent = '+1 point — unique correct answer';
  } else {
    banner.textContent = 'NEXT TIME';
    banner.className = 'result-banner miss';
    if (!myAns || !myAns.answer_text) {
      reason.textContent = `No answer submitted — answer was: ${q.correct}`;
    } else if (!myAns.is_correct) {
      reason.textContent = `Wrong — correct was: ${q.correct}`;
    } else {
      const matched = (answers || []).filter(a =>
        a.is_correct && a.canonical === myAns.canonical && a.player_id !== state.playerId
      );
      const names = matched
        .map(a => state.players.find(p => p.id === a.player_id)?.name)
        .filter(Boolean);
      reason.textContent = names.length
        ? `Matched with ${names.join(', ')} — no points`
        : 'Correct but no points awarded';
    }
  }

  await refreshPlayers();
  const ul = $('result-players');
  ul.innerHTML = '';
  state.players.forEach(p => {
    const a = (answers || []).find(x => x.player_id === p.id);
    const li = document.createElement('li');
    li.classList.add(a && a.scored ? 'scored' : 'missed');
    li.innerHTML = `
      <span>${escapeHtml(p.name)} <small class="answer">"${escapeHtml(a?.answer_text || '—')}"</small></span>
      <span class="score">${p.score}</span>
    `;
    ul.appendChild(li);
  });
}

// ═══════════════════════════════════════════════════════════════════════════
//  FINAL SCREEN
// ═══════════════════════════════════════════════════════════════════════════

async function renderFinal() {
  await refreshPlayers();
  const winner = state.players[0];
  $('final-winner-name').textContent   = winner?.name || '—';
  $('final-winner-points').textContent = `${winner?.score || 0} point${winner?.score === 1 ? '' : 's'}`;

  const ul = $('final-players');
  ul.innerHTML = '';
  state.players.forEach((p, i) => {
    const li = document.createElement('li');
    li.innerHTML = `<span>${i+1}. ${escapeHtml(p.name)}</span><span class="score">${p.score}</span>`;
    ul.appendChild(li);
  });

  $('btn-play-again').classList.toggle('hidden', !state.isHost);
}

// ═══════════════════════════════════════════════════════════════════════════
//  PLAY AGAIN (host only) — reset room state, same players
// ═══════════════════════════════════════════════════════════════════════════

async function playAgain() {
  if (!state.isHost) return;

  await state.supabase.from('players').update({ score: 0 }).eq('room_id', state.roomId);
  await state.supabase.from('answers').delete().eq('room_id', state.roomId);

  const shuffled = [...state.questions].sort(() => Math.random() - 0.5);
  const selected = shuffled.slice(0, QUESTIONS_PER_GAME);

  await state.supabase.from('rooms').update({
    phase: 'lobby',
    status: 'waiting',
    current_q: -1,
    questions: selected,
  }).eq('id', state.roomId);
}

async function leaveRoom() {
  if (state.playerId) {
    await state.supabase.from('players').delete().eq('id', state.playerId);
  }
  if (channel) await channel.unsubscribe();
  location.href = location.pathname;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// ═══════════════════════════════════════════════════════════════════════════
//  GO
// ═══════════════════════════════════════════════════════════════════════════

init();

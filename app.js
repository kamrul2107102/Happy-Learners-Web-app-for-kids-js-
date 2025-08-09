/* app.js — Happy Learners (enhanced)
   Features added:
   - User profiles (multiple students) stored in localStorage
   - Export / Import of data as ZIP (uses JSZip library included in index.html)
   - Confetti animation on 3-star completion
   - Lesson image support (use <img> in lesson.content or lesson.image)
   - All progress saved per user
*/

/* ========================
   Constants & storage keys
   ======================== */
   const MANIFEST_PATH = 'data/manifest.json';
   const LS_MANIFEST_KEY = 'hl_manifest';
   const LS_DATA_PREFIX = 'hl_data:';            // stored JSON files
   const LS_PROFILES_KEY = 'hl_profiles';       // array of profiles
   const LS_ACTIVE_PROFILE = 'hl_active_profile';// active profile id
   const LS_PROGRESS_PREFIX = 'hl_progress:';    // hl_progress:{userId}:{grade}:{subjectId}
   
   /* DOM shortcuts */
   const appEl = document.getElementById('app');
   const progressBarEl = document.getElementById('global-progress-bar');
   const adminModal = document.getElementById('admin-modal');
   const adminOpenBtn = document.getElementById('open-admin');
   const adminCloseBtn = document.getElementById('close-admin');
   const adminUploadInput = document.getElementById('admin-upload');
   const adminFileList = document.getElementById('admin-file-list');
   const adminFilenameInput = document.getElementById('admin-filename');
   const adminJsonTextarea = document.getElementById('admin-json');
   const adminSaveBtn = document.getElementById('admin-save');
   const adminResetBtn = document.getElementById('admin-reset');
   const adminLoadSamplesBtn = document.getElementById('admin-load-samples');
   const adminExportZipBtn = document.getElementById('admin-export-zip');
   const adminImportZipInput = document.getElementById('admin-import-zip');
   const adminShowDataBtn = document.getElementById('admin-show-data');
   const profileArea = document.getElementById('profile-area');
   const confettiCanvas = document.getElementById('confetti-canvas');
   
   /* state */
   let manifest = null;
   let currentProfile = null;
   let currentGrade = null;
   let currentFile = null;
   let currentSubjectData = null;
   let currentLessonIndex = 0;
   
   /* ========================
      Utility functions
      ======================== */
   function $(sel, root=document){ return root.querySelector(sel) }
   function create(tag, opts={}) {
     const el = document.createElement(tag);
     for (const k in opts) {
       if (k === 'class') el.className = opts[k];
       else if (k === 'text') el.textContent = opts[k];
       else if (k === 'html') el.innerHTML = opts[k];
       else el.setAttribute(k, opts[k]);
     }
     return el;
   }
   function saveToLS(key, val){ localStorage.setItem(key, JSON.stringify(val)) }
   function readFromLS(key){ const v = localStorage.getItem(key); return v ? JSON.parse(v) : null }
   function saveDataFile(path, text){ localStorage.setItem(LS_DATA_PREFIX + path, text) }
   function readDataFile(path){ return localStorage.getItem(LS_DATA_PREFIX + path) }
   
   /* ========================
      Profiles management
      ======================== */
   function loadProfiles(){ return readFromLS(LS_PROFILES_KEY) || [] }
   function saveProfiles(list){ saveToLS(LS_PROFILES_KEY, list) }
   function getActiveProfileId(){ return localStorage.getItem(LS_ACTIVE_PROFILE) }
   function setActiveProfileId(id){ localStorage.setItem(LS_ACTIVE_PROFILE, id) }
   function createProfile(name){
     const profiles = loadProfiles();
     const id = 'p_' + Date.now();
     profiles.push({id,name,created:Date.now()});
     saveProfiles(profiles);
     setActiveProfileId(id);
     renderProfileUI();
   }
   function deleteProfile(id){
     if (!confirm('Delete this profile and its progress?')) return;
     const profiles = loadProfiles().filter(p=>p.id!==id);
     saveProfiles(profiles);
     // remove progress keys for that profile
     Object.keys(localStorage).forEach(k=>{
       if (k.startsWith(LS_PROGRESS_PREFIX + id + ':')) localStorage.removeItem(k);
     });
     // if active removed, clear active
     if (getActiveProfileId() === id) localStorage.removeItem(LS_ACTIVE_PROFILE);
     renderProfileUI();
   }
   function renderProfileUI(){
     profileArea.innerHTML = '';
     const profiles = loadProfiles();
     const wrapper = create('div', {class:'profile-pill'});
     if (profiles.length === 0){
       // show quick create
       const createBtn = create('button',{class:'profile-create', text:'+ Create Profile'});
       createBtn.addEventListener('click', ()=> {
         const name = prompt('Enter child name (e.g. "Sam")');
         if (name) createProfile(name.trim());
       });
       wrapper.appendChild(createBtn);
       profileArea.appendChild(wrapper);
       return;
     }
     // dropdown select
     const select = create('select',{class:'profile-select'});
     profiles.forEach(p=>{
       const opt = create('option',{value:p.id, text: p.name});
       select.appendChild(opt);
     });
     // set selected to active
     const active = getActiveProfileId();
     if (active) select.value = active;
     select.addEventListener('change', ()=>{
       setActiveProfileId(select.value);
       renderProfileUI();
       // re-render grade selection to reflect new user
       renderGradeSelection();
     });
     wrapper.appendChild(select);
     // quick create button
     const plus = create('button',{class:'profile-create', text:'+ New'});
     plus.addEventListener('click', ()=> {
       const name = prompt('Enter new profile name:');
       if (name) createProfile(name.trim());
     });
     wrapper.appendChild(plus);
   
     // avatar & delete for active profile
     const activeObj = profiles.find(p => p.id === getActiveProfileId()) || profiles[0];
     if (activeObj) {
       setActiveProfileId(activeObj.id); // ensure
       const pill = create('div',{class:'profile-avatar', html: activeObj.name.charAt(0).toUpperCase()});
       const nameEl = create('div',{class:'profile-name', text:activeObj.name});
       const del = create('button',{class:'btn small', text:'Delete'});
       del.addEventListener('click', ()=> deleteProfile(activeObj.id));
       profileArea.appendChild(pill);
       profileArea.appendChild(nameEl);
       profileArea.appendChild(del);
     }
   
     profileArea.appendChild(wrapper);
   }
   
   /* ========================
      Sound & confetti
      ======================== */
   let audioCtx = null;
   function ensureAudioContext(){ if (!audioCtx) try{ audioCtx = new (window.AudioContext||window.webkitAudioContext)() }catch(e){ audioCtx=null } }
   function playTone(type='correct'){
     ensureAudioContext();
     if (!audioCtx) return;
     const now = audioCtx.currentTime;
     const o = audioCtx.createOscillator();
     const g = audioCtx.createGain();
     o.connect(g); g.connect(audioCtx.destination);
     if (type==='correct'){ o.frequency.setValueAtTime(880, now); g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(0.2, now+0.02); o.frequency.exponentialRampToValueAtTime(1320, now+0.15); }
     else { o.frequency.setValueAtTime(220, now); g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(0.18, now+0.02); o.frequency.exponentialRampToValueAtTime(180, now+0.15);}
     o.start(now); o.stop(now+0.25);
   }
   
   /* Confetti basic implementation (no libs) */
   const confetti = (function(){
     const canvas = confettiCanvas;
     const ctx = canvas.getContext('2d');
     let W=0,H=0, pieces=[];
     function resize(){ W=canvas.width=window.innerWidth; H=canvas.height=window.innerHeight; }
     window.addEventListener('resize', resize);
     resize();
     function rand(min,max){ return Math.random()*(max-min)+min }
     function make(n){
       pieces = [];
       const colors = ['#ff5c8a','#ffd166','#7ef8c4','#8bd3ff','#c39cff'];
       for (let i=0;i<n;i++){
         pieces.push({
           x: rand(0,W),
           y: rand(-H,0),
           w: rand(6,12),
           h: rand(8,14),
           color: colors[Math.floor(Math.random()*colors.length)],
           rot: rand(0,360),
           velX: rand(-1.5,1.5),
           velY: rand(2,6),
           spin: rand(-0.2,0.2)
         });
       }
     }
     let running = false;
     function step(){
       if (!running) return;
       ctx.clearRect(0,0,W,H);
       for (let p of pieces){
         p.x += p.velX; p.y += p.velY; p.rot += p.spin;
         ctx.save();
         ctx.translate(p.x,p.y); ctx.rotate(p.rot);
         ctx.fillStyle = p.color;
         ctx.fillRect(-p.w/2, -p.h/2, p.w, p.h);
         ctx.restore();
       }
       // remove offscreen
       pieces = pieces.filter(p=>p.y < H+50);
       if (pieces.length === 0) { running=false; ctx.clearRect(0,0,W,H); return; }
       requestAnimationFrame(step);
     }
     return {
       burst(n=80){ make(n); if (!running){ running=true; step(); } }
     };
   })();
   
   /* ========================
      Manifest & data helpers
      ======================== */
   async function loadManifest(){
     try {
       const res = await fetch(MANIFEST_PATH);
       if (!res.ok) throw new Error('manifest fetch failed');
       const json = await res.json();
       manifest = json.files;
       saveToLS(LS_MANIFEST_KEY, manifest);
       return manifest;
     } catch(e){
       const ls = readFromLS(LS_MANIFEST_KEY);
       if (ls && Array.isArray(ls) && ls.length) { manifest = ls; return manifest; }
       manifest = null; return null;
     }
   }
   
   async function fetchDataFile(path){
     const stored = readDataFile(path);
     if (stored) {
       try { return JSON.parse(stored); } catch(e){ console.warn('invalid stored JSON', e) }
     }
     try {
       const res = await fetch(path);
       if (!res.ok) throw new Error('failed fetch '+path);
       const json = await res.json();
       return json;
     } catch(e){
       console.warn('fetch failed for', path, e);
       return null;
     }
   }
   
   /* ========================
      Renderers
      ======================== */
   
   function showMessage(html){
     appEl.innerHTML = `<div class="card"><div class="lesson-body">${html}</div></div>`;
   }
   
   function renderGradeSelection(){
     currentGrade = null;
     currentFile = null;
     currentSubjectData = null;
     currentLessonIndex = 0;
     const cont = create('div');
     cont.innerHTML = `<h2 style="text-align:center">Pick a Grade 🎓</h2>`;
     const grid = create('div',{class:'grid'});
     [1,2,3].forEach(g=>{
       const card = create('div',{class:'card'});
       card.innerHTML = `<div style="font-size:26px">Grade ${g}</div><div class="note">Ages ${g+5} approx</div>`;
       const btn = create('button',{class:'big-btn'});
       btn.textContent = `Go to Grade ${g} ➜`;
       btn.addEventListener('click', ()=>renderSubjectList(g));
       card.appendChild(btn);
       grid.appendChild(card);
     });
     cont.appendChild(grid);
     appEl.innerHTML = '';
     appEl.appendChild(cont);
     updateGlobalProgress(0);
   }
   
   function renderSubjectList(grade){
     currentGrade = grade;
     currentFile = null;
     currentSubjectData = null;
     currentLessonIndex = 0;
     if (!manifest) {
       showMessage(`<div style="text-align:center"><strong>Data not found.</strong><p class="note">Open Admin (⚙️) and upload the JSON files from the /data folder (multi-select).</p></div>`);
       return;
     }
     const subjects = manifest.filter(m => Number(m.grade) === Number(grade));
     const cont = create('div');
     cont.innerHTML = `<h2 style="text-align:center">Grade ${grade} Subjects</h2>`;
     const grid = create('div',{class:'grid'});
     if (!subjects.length){
       grid.innerHTML = `<div class="card"><div class="lesson-body">No subjects listed for this grade in the manifest.</div></div>`;
     } else {
       subjects.forEach(s=>{
         const card = create('div',{class:'card'});
         // show emoji if label contains emoji, else generic book
         const emoji = s.label && s.label.match(/[\u{1F300}-\u{1FAFF}]/u) ? '' : '📘';
         card.innerHTML = `<div class="subject-emoji">${emoji}</div><div style="font-weight:800;margin-bottom:6px">${s.label}</div><div class="note">Grade ${s.grade}</div>`;
         const btn = create('button',{class:'subject-btn'});
         btn.textContent = 'Open Subject →';
         btn.addEventListener('click', ()=>openSubject(s));
         card.appendChild(btn);
         grid.appendChild(card);
       });
     }
     cont.appendChild(grid);
     cont.appendChild(create('div',{html:'<div style="text-align:center;margin-top:16px"><button class="btn secondary" id="back-to-grades">⬅ Back to Grades</button></div>'}) );
     appEl.innerHTML = '';
     appEl.appendChild(cont);
     $('#back-to-grades')?.addEventListener('click', renderGradeSelection);
     updateGlobalProgress(0);
   }
   
   async function openSubject(manifestEntry){
     const path = manifestEntry.path;
     const data = await fetchDataFile(path);
     if (!data){
       showMessage(`<div style="text-align:center"><strong>Unable to load subject:</strong><div class="note">${path}</div><div class="note">If you're on file://, upload the JSON using Admin.</div></div>`);
       return;
     }
     currentFile = path;
     currentSubjectData = data;
     currentLessonIndex = 0;
     renderSubjectHome();
   }
   
   function renderSubjectHome(){
     const meta = currentSubjectData.meta || {};
     const totalLessons = (currentSubjectData.lessons||[]).length;
     const cont = create('div');
     cont.innerHTML = `<h2 style="text-align:center">${meta.label || meta.subjectId || 'Subject'}</h2>
       <div class="card">
         <div class="lesson-title">${meta.description||''}</div>
         <div class="note">Lessons: ${totalLessons}</div>
         <div style="margin-top:12px" class="controls">
           <button class="btn" id="btn-learning">Learning Mode 📚</button>
           <button class="btn secondary" id="btn-quiz">Exam Mode 📝</button>
           <button class="btn small" id="btn-progress">View Progress ⭐</button>
         </div>
       </div>
     `;
     appEl.innerHTML = '';
     appEl.appendChild(cont);
     //back to the grade page
     cont.appendChild(create('div', {
        html: `
          <div style="text-align:center; margin-top:16px;">
            <button class="btn secondary" id="back-to-subjects">⬅ Back to Grades</button>
          </div>`
      }));
      
      document.getElementById('back-to-subjects').addEventListener('click', renderGradeSelection);
      
      progressBarEl.style.display = 'block';
      progressBarEl.style.width = '0%';
      

     $('#btn-learning').addEventListener('click', ()=>renderLessonView(0));
     $('#btn-quiz').addEventListener('click', ()=>startQuizUI());
     $('#btn-progress').addEventListener('click', ()=>renderProgressView());
     updateGlobalProgressForSubject();
   }
   
   function renderLessonView(index){
     if (!currentSubjectData) return;
     const lessons = currentSubjectData.lessons || [];
     if (index < 0) index = 0;
     if (index >= lessons.length) index = lessons.length - 1;
     currentLessonIndex = index;
     const lesson = lessons[index];
     // support lesson.image if present (url or data URL)
     const imageHtml = lesson.image ? `<div style="text-align:center;margin-bottom:8px"><img src="${lesson.image}" alt="" style="max-width:220px;border-radius:8px"/></div>` : '';
     const cont = create('div');
     cont.innerHTML = `
       <h2 style="text-align:center">${lesson.title}</h2>
       <div class="card">
         ${imageHtml}
         <div class="lesson-body">${lesson.content || ''}</div>
         <div class="nav-row">
           <div><button class="btn small" id="prev-lesson">⬅ Prev</button></div>
           <div style="text-align:center;">
             <button class="btn small" id="mark-done">✅ Mark Complete</button>
           </div>
           <div style="text-align:right;"><button class="btn small" id="next-lesson">Next ➡</button></div>
         </div>
         <div style="margin-top:10px;text-align:center">
           <button class="btn secondary small" id="lesson-quiz">Take this Lesson's Quiz 🧪</button>
         </div>
         <div class="back-to-subjects"> 
            <button class="btn secondary small" id="back-to-subject">← Back to Subject</button>
          </div>
         <div
       </div>
     `;
     //add back to subjects button
    /* cont.appendChild(create('div', {
        html: `
            <div style="text-align:center; margin-top:16px;">
                <button class="btn secondary" id="back-to-subjects">⬅ Back to Subjects</button>
            </div>`
        }));
        document.getElementById('back-to-subjects').addEventListener('click', renderSubjectHome); 
        */  

     appEl.innerHTML = '';
     appEl.appendChild(cont);

     $('#prev-lesson').addEventListener('click', ()=>renderLessonView(currentLessonIndex - 1));
     $('#next-lesson').addEventListener('click', ()=>renderLessonView(currentLessonIndex + 1));
     $('#lesson-quiz').addEventListener('click', ()=>startQuizUI({source:'lesson', lessonIndex: currentLessonIndex}));
     $('#mark-done').addEventListener('click', ()=>{ markLessonComplete(); playTone('correct'); renderLessonView(currentLessonIndex) });
      $('#back-to-subject').addEventListener('click', renderSubjectHome);
     updateProgressIndicator();
   }
   
   /* Progress keys are per user */
   function progressKeyFor(userId, grade, subjectId){
     return `${LS_PROGRESS_PREFIX}${userId}:${grade}:${subjectId}`;
   }
   function loadProgress(userId, grade, subjectId){
     const key = progressKeyFor(userId, grade, subjectId);
     return readFromLS(key) || {completedLessons:[], quizAttempts:[]};
   }
   function saveProgress(userId, grade, subjectId, obj){
     const key = progressKeyFor(userId, grade, subjectId);
     saveToLS(key, obj);
   }
   function markLessonComplete(){
     const userId = getActiveProfileId();
     if (!userId){ alert('Create/select a profile first'); return; }
     const grade = currentSubjectData?.meta?.grade ?? currentGrade;
     const subjectId = currentSubjectData?.meta?.subjectId ?? 'unknown';
     const progress = loadProgress(userId, grade, subjectId);
     const lessonId = currentSubjectData.lessons[currentLessonIndex].id;
     if (!progress.completedLessons.includes(lessonId)){
       progress.completedLessons.push(lessonId);
       saveProgress(userId, grade, subjectId, progress);
       updateGlobalProgressForSubject();
     }
   }
   
   function updateProgressIndicator(){
     const userId = getActiveProfileId();
     if (!userId) return;
     const lessonCount = (currentSubjectData.lessons||[]).length;
     const progress = loadProgress(userId, currentSubjectData.meta.grade, currentSubjectData.meta.subjectId);
     const completed = progress.completedLessons.length;
     const percent = lessonCount ? Math.round((completed/lessonCount)*100) : 0;
     progressBarEl.style.width = `${percent}%`;
   }
   
   function updateGlobalProgressForSubject(){
     const userId = getActiveProfileId();
     if (!userId) return updateGlobalProgress(0);
     const lessonCount = (currentSubjectData.lessons||[]).length;
     const progress = loadProgress(userId, currentSubjectData.meta.grade, currentSubjectData.meta.subjectId);
     const completed = progress.completedLessons.length;
     const percent = lessonCount ? Math.round((completed/lessonCount)*100) : 0;
     updateGlobalProgress(percent);
   }
   function updateGlobalProgress(percent){
     const el = progressBarEl;
     if (el) el.style.width = `${percent}%`;
   }
   
   function renderProgressView(){
     const userId = getActiveProfileId();
     if (!userId){ alert('Select or create a profile first'); return; }
     const prog = loadProgress(userId, currentSubjectData.meta.grade, currentSubjectData.meta.subjectId);
     const attempts = prog.quizAttempts || [];
     const cont = create('div');
     cont.innerHTML = `<h2 style="text-align:center">Progress for ${currentSubjectData.meta.label}</h2>`;
     const card = create('div',{class:'card'});
     card.innerHTML = `<div class="note">Completed lessons: ${prog.completedLessons.length || 0} / ${(currentSubjectData.lessons||[]).length}</div>`;
     const list = create('div');
     if (!attempts.length) list.innerHTML = `<div class="note" style="margin-top:6px">No quiz attempts yet</div>`;
     else {
       attempts.slice().reverse().forEach(a=>{
         const item = create('div',{class:'file-item'});
         item.innerHTML = `<div><strong>${a.score}%</strong> — ${new Date(a.date).toLocaleString()} (${a.mode||'quiz'})</div><div>${a.stars? '⭐'.repeat(a.stars):''}</div>`;
         list.appendChild(item);
       });
     }
     card.appendChild(list);
     card.appendChild(create('div',{html:'<div style="margin-top:10px"><button class="btn small" id="back-to-sub">← Back</button></div>'}) );
     cont.appendChild(card);
     appEl.innerHTML = '';
     appEl.appendChild(cont);
     $('#back-to-sub').addEventListener('click', renderSubjectHome);
   }
   
   /* ======================
      Quiz engine & UI
      ====================== */
   
   function startQuizUI(opts={source:'subject'}) {
     const pool = [];
     if (!currentSubjectData) return;
     if (opts.source === 'lesson') {
       const lesson = currentSubjectData.lessons[opts.lessonIndex];
       if (lesson && Array.isArray(lesson.quiz)) pool.push(...lesson.quiz);
     } else {
       (currentSubjectData.lessons||[]).forEach(les=>{
         if (Array.isArray(les.quiz)) pool.push(...les.quiz);
       });
     }
     if (!pool.length){
       showMessage('<div style="text-align:center">No quiz questions found for this subject.</div>');
       return;
     }
   
     const cont = create('div');
     cont.innerHTML = `
       <h2 style="text-align:center">Quiz: ${currentSubjectData.meta.label}</h2>
       <div class="card">
         <div class="note">Questions: ${pool.length}</div>
         <div style="margin-top:8px">
           <label><input type="checkbox" id="quiz-timer"> Use timer (30s per question)</label>
         </div>
         <div style="margin-top:12px" class="controls">
           <button class="btn" id="start-quiz-now">Start Quiz 🚀</button>
           <button class="btn secondary" id="cancel-quiz">Cancel</button>
         </div>
       </div>
     `;
     appEl.innerHTML = '';
     appEl.appendChild(cont);
     $('#start-quiz-now').addEventListener('click', ()=>runQuiz(pool, {timer: $('#quiz-timer').checked, mode: opts.source}));
     $('#cancel-quiz').addEventListener('click', renderSubjectHome);
   }
   
   function runQuiz(pool, opts={timer:false,mode:'subject'}) {
    const questions = shuffleArray(pool.slice());
    const total = questions.length;
    let index = 0;
    let score = 0;
    let timerInterval = null;
    let timeLeft = 0;
    const userId = getActiveProfileId();
  
    function endQuiz(){
      if (timerInterval) clearInterval(timerInterval);
      const percent = Math.round((score / total) * 100);
      const stars = percent >= 90 ? 3 : percent >= 70 ? 2 : percent >= 50 ? 1 : 0;
      // save attempt
      const grade = currentSubjectData.meta.grade;
      const subjectId = currentSubjectData.meta.subjectId;
      const progress = loadProgress(userId, grade, subjectId);
      progress.quizAttempts = progress.quizAttempts || [];
      progress.quizAttempts.push({score: percent, date: Date.now(), stars, mode: opts.mode});
      saveProgress(userId, grade, subjectId, progress);
      // show summary and confetti if 3 stars
      appEl.innerHTML = '';
      const card = create('div',{class:'card'});
      card.innerHTML = `<h2 style="text-align:center">Result</h2>
        <div style="font-size:22px;text-align:center;margin:10px">${score} / ${total} correct</div>
        <div style="text-align:center;font-size:20px">${percent}%</div>
        <div style="text-align:center;margin:12px">${'⭐'.repeat(stars)}</div>
        <div style="text-align:center" class="note">${motivationalMessage(percent)}</div>
        <div style="margin-top:12px;text-align:center">
          <button class="btn" id="btn-replay">Try Again</button>
          <button class="btn secondary" id="btn-back">Back to Subject</button>
        </div>
      `;
      appEl.appendChild(card);
  
      $('#btn-replay').addEventListener('click', ()=>startQuizUI({source:opts.mode==='lesson'?'lesson':'subject', lessonIndex: currentLessonIndex}));
      $('#btn-back').addEventListener('click', renderSubjectHome);
      updateGlobalProgressForSubject();
      if (stars === 3) { confetti.burst(110); playTone('correct'); }
    }
  
    function nextQuestion(delay=700) {
      if (timerInterval) clearInterval(timerInterval);
      setTimeout(() => {
        index++;
        if (index < total) {
          startNext();
        } else {
          endQuiz();
        }
      }, delay);
    }
  
    function showQuestion(q){
      appEl.innerHTML = '';
      const container = create('div');
      container.innerHTML = `<h2 style="text-align:center">Question ${index+1} / ${total}</h2>`;
      if (opts.timer){
        const timerCard = create('div',{class:'card'});
        timerCard.innerHTML = `<div style="font-weight:700">Time left: <span id="timer-display">${timeLeft}</span>s</div>`;
        container.appendChild(timerCard);
      }
      const qcard = create('div',{class:'card'});
      qcard.innerHTML = `<div class="lesson-title">${q.question}</div>`;
      container.appendChild(qcard);
  
      if (q.type === 'multiple_choice'){
        q.options.forEach(opt=>{
          const optEl = create('div',{class:'quiz-option', text:opt});
          optEl.addEventListener('click', ()=>{
            Array.from(container.querySelectorAll('.quiz-option')).forEach(x=>x.style.pointerEvents='none');
            if (String(opt) === String(q.answer)){
              optEl.classList.add('correct'); playTone('correct'); score++;
            } else { optEl.classList.add('wrong'); playTone('incorrect'); }
            nextQuestion(700);
          });
          qcard.appendChild(optEl);
        });
      }
      else if (q.type === 'drag_match') {
        const pairs = q.pairs.slice();
        const lefts = shuffleArray(pairs.map(p=>p.left));
        const rights = pairs.map(p=>p.right);
        const matchContainer = create('div',{class:'match-row'});
  
        const leftCol = create('div',{class:'card', html:'<div style="font-weight:700">Drag these</div>'});
        const rightCol = create('div',{class:'card', html:'<div style="font-weight:700">Drop here</div>'});
        leftCol.style.flex='1'; rightCol.style.flex='1';
  
        const ulLeft = create('div');
        const ulRight = create('div');
  
        lefts.forEach(item=>{
          const it = create('div',{class:'quiz-option', text:item});
          it.setAttribute('draggable','true');
          it.dataset.value = item;
          it.addEventListener('dragstart', e=> e.dataTransfer.setData('text/plain', item));
          ulLeft.appendChild(it);
        });
  
        const shuffledRights = shuffleArray(rights.slice());
        shuffledRights.forEach(r=>{
          const zone = create('div',{class:'quiz-option', html:`<div style="font-weight:600">${r}</div><div class="note">Drop answer here</div>`});
          zone.dataset.target = r;
          zone.addEventListener('dragover', e=>e.preventDefault());
          zone.addEventListener('drop', e=>{
            e.preventDefault();
            const val = e.dataTransfer.getData('text/plain');
            zone.querySelector('.note').textContent = val;
            zone.dataset.got = val;
            checkDragMatchCompletion();
          });
          ulRight.appendChild(zone);
        });
  
        leftCol.appendChild(ulLeft); rightCol.appendChild(ulRight);
        matchContainer.appendChild(leftCol); matchContainer.appendChild(rightCol);
        container.appendChild(matchContainer);
  
        function checkDragMatchCompletion(){
          const zones = Array.from(ulRight.querySelectorAll('.quiz-option'));
          if (zones.every(z=>z.dataset.got)){
            let correctCount = 0;
            zones.forEach(z=>{
              const target = z.dataset.target;
              const got = z.dataset.got;
              const found = q.pairs.find(p => String(p.left) === String(got) && String(p.right) === String(target));
              if (found) correctCount++;
            });
            if (correctCount === zones.length) { score++; playTone('correct'); }
            else playTone('incorrect');
            nextQuestion(900);
          }
        }
      }
      else if (q.type === 'ordering'){
        const items = shuffleArray(q.items.slice());
        const list = create('div');
        qcard.appendChild(list);
  
        const selectedOrder = [];
  
        items.forEach(it=>{
          const itEl = create('div',{class:'quiz-option', text:it});
          itEl.addEventListener('click', ()=>{
            itEl.style.opacity = 0.5;
            itEl.style.pointerEvents = 'none';
            const placed = create('div',{class:'quiz-option', text:it});
            list.appendChild(placed);
            selectedOrder.push(it);
          });
          qcard.appendChild(itEl);
        });
        const submit = create('button',{class:'btn small', text:'Submit order'});
        submit.addEventListener('click', ()=>{
          const correct = q.answerOrder;
          if (JSON.stringify(selectedOrder) === JSON.stringify(correct)){ 
            score++; playTone('correct'); 
          }
          else playTone('incorrect');
          nextQuestion(700);
        });
        qcard.appendChild(submit);
      }
      else if( q.type === 'fill_in_the_blank'){
        const input = create('input',{type:'text', class:'quiz-input', placeholder:'Type your answer here...'});
        qcard.appendChild(input);
        const submit = create('button',{class:'btn small', text:'Submit Answer'});
        submit.addEventListener('click', ()=>{
          const answer = input.value.trim();
          if (String(answer).toLowerCase() === String(q.answer).toLowerCase()){
            score++; playTone('correct');
            input.classList.add('correct');
          } else {
            playTone('incorrect');
            input.classList.add('wrong');
          }
          nextQuestion(700);
        });
        qcard.appendChild(submit);
      }
      else if (q.type === 'true_false'){
        const trueBtn = create('button',{class:'quiz-option', text:'True'});
        const falseBtn = create('button',{class:'quiz-option', text:'False'});
        trueBtn.addEventListener('click', ()=>{
          if (q.answer === true){ score++; playTone('correct'); }
          else { playTone('incorrect'); }
          trueBtn.style.pointerEvents = 'none'; falseBtn.style.pointerEvents = 'none';
          nextQuestion(700);
        });
        falseBtn.addEventListener('click', ()=>{
          if (q.answer === false){ score++; playTone('correct'); }
          else { playTone('incorrect'); }
          trueBtn.style.pointerEvents = 'none'; falseBtn.style.pointerEvents = 'none';
          nextQuestion(700);
        });
        qcard.appendChild(trueBtn);
        qcard.appendChild(falseBtn);
      }
      else {
        qcard.appendChild(create('div',{class:'note', html:'Unsupported question type.'}));
        nextQuestion(700);
      }
  
      appEl.appendChild(container);
  
      if (opts.timer){
        timeLeft = 30;
        const disp = container.querySelector('#timer-display');
        if (disp) disp.textContent = timeLeft;
        timerInterval = setInterval(()=>{
          timeLeft--;
          const disp = container.querySelector('#timer-display');
          if (disp) disp.textContent = timeLeft;
          if (timeLeft <= 0){
            clearInterval(timerInterval);
            playTone('incorrect');
            nextQuestion(0);
          }
        },1000);
      }
    }
  
    function startNext(){
      if (timerInterval) clearInterval(timerInterval);
      showQuestion(questions[index]);
    }
  
    startNext();
  }
  
   
   function motivationalMessage(percent){
     if (percent >= 90) return "Amazing work! You're a superstar! 🌟";
     if (percent >= 70) return "Great job — keep going! 👍";
     if (percent >= 50) return "Nice try — a little more practice and you'll ace it! 💪";
     return "Don't worry — try again and you'll improve! 😊";
   }
   
   /* ======================
      Admin: upload/edit + ZIP backup & restore
      ====================== */
   function setupAdmin(){
     adminOpenBtn.addEventListener('click', ()=>{ adminModal.classList.remove('hidden'); refreshAdminFileList(); });
     adminCloseBtn.addEventListener('click', ()=>{ adminModal.classList.add('hidden'); });
     adminUploadInput.addEventListener('change', async (e)=>{
       const files = Array.from(e.target.files || []);
       if (!files.length) return;
       for (const f of files){
         try {
           const text = await f.text();
           const path = 'data/' + f.name;
           saveDataFile(path, text);
           // parse meta
           const json = JSON.parse(text);
           const meta = json.meta || {};
           manifest = manifest || [];
           const exists = manifest.find(m => m.path === path);
           if (!exists){
             manifest.push({path, grade: meta.grade || 0, subjectId: meta.subjectId || f.name.replace('.json',''), label: meta.label || f.name});
           }
         } catch(err){
           console.warn('upload error', err);
         }
       }
       saveToLS(LS_MANIFEST_KEY, manifest);
       refreshAdminFileList();
       alert('Files uploaded and stored locally in browser.');
       adminUploadInput.value = '';
     });
   
     adminSaveBtn.addEventListener('click', ()=>{
       const filename = adminFilenameInput.value.trim();
       const text = adminJsonTextarea.value.trim();
       if (!filename || !text) { alert('Provide filename and JSON content'); return; }
       try { JSON.parse(text); } catch(e){ alert('Invalid JSON: '+e.message); return; }
       const path = filename.startsWith('data/') ? filename : ('data/' + filename);
       saveDataFile(path, text);
       const json = JSON.parse(text);
       const meta = json.meta || {};
       manifest = manifest || [];
       const exists = manifest.find(m => m.path === path);
       if (!exists) manifest.push({path, grade: meta.grade || 0, subjectId: meta.subjectId || path.replace('data/','').replace('.json',''), label: meta.label || path});
       saveToLS(LS_MANIFEST_KEY, manifest);
       refreshAdminFileList();
       alert('Saved to local storage (available immediately).');
     });
   
     adminResetBtn.addEventListener('click', ()=>{
       if (!confirm('Clear uploaded JSON files and manifest from this browser?')) return;
       Object.keys(localStorage).forEach(k=>{
         if (k.startsWith(LS_DATA_PREFIX) || k === LS_MANIFEST_KEY || k === LS_PROFILES_KEY || k === LS_ACTIVE_PROFILE) localStorage.removeItem(k);
       });
       manifest = null;
       refreshAdminFileList();
       alert('Reset done. You may reload the page.');
       renderProfileUI();
       renderGradeSelection();
     });
   
     adminLoadSamplesBtn.addEventListener('click', ()=> {
       alert('You can paste sample JSON into the editor and click Save JSON with a filename like data/grade1_myfile.json');
     });
   
     adminExportZipBtn.addEventListener('click', async ()=>{
       // build zip containing:
       // - manifest (from localStorage or file)
       // - all stored data files (LS_DATA_PREFIX)
       // - profiles and active profile
       const zip = new JSZip();
       const m = readFromLS(LS_MANIFEST_KEY) || manifest || [];
       zip.file('manifest.json', JSON.stringify(m, null, 2));
       // include stored data files
       Object.keys(localStorage).forEach(k=>{
         if (k.startsWith(LS_DATA_PREFIX)){
           const path = k.replace(LS_DATA_PREFIX,'');
           const text = localStorage.getItem(k);
           zip.file(path, text);
         }
       });
       // include profiles & active profile
       const profiles = readFromLS(LS_PROFILES_KEY) || [];
       const active = getActiveProfileId();
       zip.file('profiles.json', JSON.stringify({profiles,active}, null, 2));
       const blob = await zip.generateAsync({type:'blob'});
       const url = URL.createObjectURL(blob);
       const a = document.createElement('a');
       a.href = url; a.download = 'happy-learners-backup.zip';
       document.body.appendChild(a); a.click(); a.remove();
       URL.revokeObjectURL(url);
     });
   
     adminImportZipInput.addEventListener('change', async (e)=>{
       const f = e.target.files[0];
       if (!f) return;
       try {
         const arrayBuffer = await f.arrayBuffer();
         const zip = await JSZip.loadAsync(arrayBuffer);
         // manifest if present
         if (zip.file('manifest.json')){
           const manifestText = await zip.file('manifest.json').async('string');
           try { const m = JSON.parse(manifestText); saveToLS(LS_MANIFEST_KEY, m); manifest = m; }
           catch(e){ console.warn('manifest parse error', e); }
         }
         // profiles
         if (zip.file('profiles.json')){
           const ptxt = await zip.file('profiles.json').async('string');
           try {
             const obj = JSON.parse(ptxt);
             if (obj.profiles) saveToLS(LS_PROFILES_KEY, obj.profiles);
             if (obj.active) localStorage.setItem(LS_ACTIVE_PROFILE, obj.active);
           } catch(e){ console.warn('profiles parse error', e) }
         }
         // other files: add all data/* entries
         const fileNames = Object.keys(zip.files);
         for (const name of fileNames){
           if (name === 'manifest.json' || name === 'profiles.json') continue;
           if (name.startsWith('data/')){
             const text = await zip.file(name).async('string');
             saveDataFile(name, text);
           }
         }
         refreshAdminFileList();
         renderProfileUI();
         alert('Backup imported successfully.');
         adminImportZipInput.value = '';
       } catch(err){ alert('Failed to import ZIP: ' + err.message); console.error(err) }
     });
   
     adminShowDataBtn.addEventListener('click', ()=>{
       const keys = Object.keys(localStorage).filter(k=>k.startsWith(LS_DATA_PREFIX) || k === LS_MANIFEST_KEY || k === LS_PROFILES_KEY || k === LS_ACTIVE_PROFILE);
       let html = '<div class="card"><div class="lesson-body"><h3>Local stored items</h3><ul>';
       keys.forEach(k => html += `<li>${k}</li>`);
       html += '</ul></div></div>';
       showMessage(html);
     });
   
     refreshAdminFileList();
   }
   
   function refreshAdminFileList(){
     adminFileList.innerHTML = '';
     const m = readFromLS(LS_MANIFEST_KEY) || manifest || [];
     if (!m.length) adminFileList.innerHTML = '<div class="note">No uploaded files stored. Use "Upload JSON files" to add data or paste JSON into the editor to save.</div>';
     else {
       m.forEach(entry=>{
         const item = create('div',{class:'file-item'});
         const path = entry.path || 'unknown';
         const stored = !!readDataFile(path);
         item.innerHTML = `<div><strong>${entry.label||entry.subjectId}</strong><div class="note">${path} — grade ${entry.grade||'?'}</div></div>
           <div style="display:flex;gap:6px;align-items:center">
             <button class="btn small load-btn">Load</button>
             <button class="btn small secondary edit-btn">${stored ? 'Edit' : 'View'}</button>
           </div>`;
         item.querySelector('.load-btn').addEventListener('click', async ()=>{
           const fileData = readDataFile(path);
           if (fileData) adminJsonTextarea.value = fileData;
           else {
             try { const r = await fetch(path); const t = await r.text(); adminJsonTextarea.value = t; }
             catch(e){ adminJsonTextarea.value = '// file not available locally or via fetch' }
           }
           adminFilenameInput.value = path;
         });
         item.querySelector('.edit-btn').addEventListener('click', ()=>{
           const fileData = readDataFile(path);
           if (fileData) adminJsonTextarea.value = fileData;
           else adminJsonTextarea.value = `// file not in local storage. Try loading it first with 'Load' or upload the JSON file.`;
           adminFilenameInput.value = path;
         });
         adminFileList.appendChild(item);
       });
     }
   }
   
   /* ======================
      Helpers & utils
      ====================== */
   function shuffleArray(arr){ for (let i=arr.length-1;i>0;i--){ const j = Math.floor(Math.random()*(i+1)); [arr[i],arr[j]]=[arr[j],arr[i]] } return arr }
   function getActiveProfileId(){ return localStorage.getItem(LS_ACTIVE_PROFILE) }
   function motivationalMessage(percent){
     if (percent >= 90) return "Amazing work! You're a superstar! 🌟";
     if (percent >= 70) return "Great job — keep going! 👍";
     if (percent >= 50) return "Nice try — a little more practice and you'll ace it! 💪";
     return "Don't worry — try again and you'll improve! 😊";
   }
   
   /* ======================
      Initialization
      ====================== */
   async function init(){
     renderProfileUI();
     setupAdmin();
     const m = await loadManifest();
     if (!m){
       showMessage(`<div style="text-align:center"><strong>Welcome!</strong><p class="note">The app couldn't automatically load the data files from <code>${MANIFEST_PATH}</code>.</p><p class="note">Open the Admin (⚙️) and upload the JSON files from the provided /data folder (you can select multiple files). After upload, close Admin and select a grade.</p></div>`);
     } else renderGradeSelection();
   }
   init();
   
   /* ======================
      Expose small helpers to global for HTML button handlers if needed
      ====================== */
   window.renderGradeSelection = renderGradeSelection;
   window.renderProfileUI = renderProfileUI;
   window.renderSubjectList = renderSubjectList;
   
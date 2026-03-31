(function () {
    let audioCtx;
    function playSound(correct) {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        var osc = audioCtx.createOscillator();
        var gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        gain.gain.value = 0.15;
        if (correct) {
            osc.frequency.value = 660;
            osc.type = 'sine';
            osc.start();
            osc.frequency.setValueAtTime(880, audioCtx.currentTime + 0.1);
            gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
            osc.stop(audioCtx.currentTime + 0.3);
        } else {
            osc.frequency.value = 300;
            osc.type = 'sawtooth';
            osc.start();
            osc.frequency.setValueAtTime(200, audioCtx.currentTime + 0.15);
            gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
            osc.stop(audioCtx.currentTime + 0.3);
        }
    }

    let supabase;
    let currentUser = null;
    let words = [];
    let quizWords = [];
    let currentIndex = 0;
    let correctCount = 0;
    let wrongWords = [];
    let currentSessionId = null;

    function init() {
        if (typeof CONFIG === 'undefined') {
            showAuthError('Missing config.js. Copy config.js.example to config.js and fill in your Supabase credentials.');
            return;
        }
        supabase = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
        loadWords();
        bindEvents();
        checkSession();
    }

    async function checkSession() {
        showAuthLoading(true);
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
            currentUser = session.user;
            showHome();
        }
        showAuthLoading(false);
    }

    async function loadWords() {
        try {
            const res = await fetch('words.json');
            words = await res.json();
            // Sort alphabetically by word
            words.sort(function (a, b) { return a.word.localeCompare(b.word); });
        } catch (e) {
            console.error('Failed to load words:', e);
        }
    }

    function bindEvents() {
        document.getElementById('show-signup').addEventListener('click', function (e) {
            e.preventDefault();
            document.getElementById('login-form').classList.add('hidden');
            document.getElementById('signup-form').classList.remove('hidden');
            hideAuthError();
        });
        document.getElementById('show-login').addEventListener('click', function (e) {
            e.preventDefault();
            document.getElementById('signup-form').classList.add('hidden');
            document.getElementById('login-form').classList.remove('hidden');
            hideAuthError();
        });
        document.getElementById('login-btn').addEventListener('click', handleLogin);
        document.getElementById('signup-btn').addEventListener('click', handleSignup);
        document.getElementById('logout-btn').addEventListener('click', handleLogout);
        document.getElementById('start-quiz-btn').addEventListener('click', handleStartOrResume);
        document.getElementById('try-again-btn').addEventListener('click', startNewQuiz);
        document.getElementById('home-btn').addEventListener('click', showHome);
        document.getElementById('download-wrong-btn').addEventListener('click', downloadWrongWords);
        document.getElementById('quiz-stats-btn').addEventListener('click', showQuizStats);
        document.getElementById('close-stats-btn').addEventListener('click', hideQuizStats);
        document.getElementById('back-to-quiz-btn').addEventListener('click', hideQuizStats);
        document.getElementById('download-quiz-correct-btn').addEventListener('click', function () { downloadWordList('correct'); });
        document.getElementById('download-quiz-wrong-btn').addEventListener('click', function () { downloadWordList('wrong'); });

        ['login-email', 'login-password'].forEach(function (id) {
            document.getElementById(id).addEventListener('keydown', function (e) {
                if (e.key === 'Enter') handleLogin();
            });
        });
        ['signup-email', 'signup-password'].forEach(function (id) {
            document.getElementById(id).addEventListener('keydown', function (e) {
                if (e.key === 'Enter') handleSignup();
            });
        });
    }

    async function handleLogin() {
        var email = document.getElementById('login-email').value.trim();
        var password = document.getElementById('login-password').value;
        if (!email || !password) { showAuthError('Please fill in all fields.'); return; }
        showAuthLoading(true);
        hideAuthError();
        var { error } = await supabase.auth.signInWithPassword({ email: email, password: password });
        showAuthLoading(false);
        if (error) { showAuthError(error.message); return; }
        var { data: { session } } = await supabase.auth.getSession();
        currentUser = session.user;
        showHome();
    }

    async function handleSignup() {
        var email = document.getElementById('signup-email').value.trim();
        var password = document.getElementById('signup-password').value;
        if (!email || !password) { showAuthError('Please fill in all fields.'); return; }
        if (password.length < 6) { showAuthError('Password must be at least 6 characters.'); return; }
        showAuthLoading(true);
        hideAuthError();
        var { data, error } = await supabase.auth.signUp({ email: email, password: password });
        showAuthLoading(false);
        if (error) { showAuthError(error.message); return; }
        if (data.user && data.session) {
            currentUser = data.user;
            showHome();
        } else {
            showAuthError('Account created! Please login.');
        }
    }

    async function handleLogout() {
        await supabase.auth.signOut();
        currentUser = null;
        currentSessionId = null;
        showPage('auth-page');
        document.getElementById('login-email').value = '';
        document.getElementById('login-password').value = '';
    }

    function showPage(pageId) {
        document.querySelectorAll('.page').forEach(function (p) {
            p.classList.remove('active');
        });
        document.getElementById(pageId).classList.add('active');
    }

    async function showHome() {
        document.getElementById('user-info').textContent = currentUser ? currentUser.email : '';
        showPage('home-page');
        await checkResumeQuiz();
        loadHistory();
    }

    function showAuthError(msg) {
        var el = document.getElementById('auth-error');
        el.textContent = msg;
        el.classList.remove('hidden');
    }

    function hideAuthError() {
        document.getElementById('auth-error').classList.add('hidden');
    }

    function showAuthLoading(show) {
        document.getElementById('auth-loading').classList.toggle('hidden', !show);
        document.getElementById('login-btn').disabled = show;
        document.getElementById('signup-btn').disabled = show;
    }

    function shuffle(arr) {
        var a = arr.slice();
        for (var i = a.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
        }
        return a;
    }

    async function checkResumeQuiz() {
        var btn = document.getElementById('start-quiz-btn');
        var infoEl = document.getElementById('resume-info');
        if (infoEl) infoEl.remove();
        btn.textContent = 'Start Quiz';

        if (!supabase || !currentUser) return;
        try {
            var { data, error } = await supabase
                .from('quiz_sessions')
                .select('*')
                .eq('user_id', currentUser.id)
                .eq('completed', false)
                .order('created_at', { ascending: false })
                .limit(1);
            if (error || !data || !data.length) return;

            var session = data[0];
            // Load answers for this session
            var { data: answers } = await supabase
                .from('progress')
                .select('word, correct')
                .eq('session_id', session.id);

            var answeredCount = answers ? answers.length : 0;
            var orderLen = JSON.parse(session.word_order).length;

            if (answeredCount === 0) {
                // No answers recorded yet, treat as fresh start
                await supabase.from('quiz_sessions').update({ completed: true }).eq('id', session.id);
                return;
            }

            // Show resume info
            var info = document.createElement('div');
            info.id = 'resume-info';
            info.style.cssText = 'margin-top:12px;padding:12px;background:#e8f0fe;border-radius:8px;font-size:14px;';
            info.textContent = 'You have an unfinished quiz (' + answeredCount + '/' + orderLen + ' done).';
            btn.parentNode.insertBefore(info, btn.nextSibling);

            btn.textContent = 'Resume Quiz';
        } catch (e) {
            console.error('Failed to check resume:', e);
        }
    }

    // Unified handler: start new or resume existing
    async function handleStartOrResume() {
        if (!words.length) return;
        // Check if there's an unfinished session
        if (supabase && currentUser) {
            var { data } = await supabase
                .from('quiz_sessions')
                .select('*')
                .eq('user_id', currentUser.id)
                .eq('completed', false)
                .order('created_at', { ascending: false })
                .limit(1);
            if (data && data.length) {
                await resumeQuiz(data[0]);
                return;
            }
        }
        await startNewQuiz();
    }

    async function getUserWordOrder() {
        // Check if user has a saved word order
        var { data } = await supabase
            .from('user_word_order')
            .select('word_order')
            .eq('user_id', currentUser.id)
            .limit(1);
        if (data && data.length) {
            var savedOrder = JSON.parse(data[0].word_order);
            // Check if word list was updated (new words added)
            var currentWords = words.map(function (w) { return w.word; });
            var savedSet = {};
            savedOrder.forEach(function (w) { savedSet[w] = true; });
            var newWords = currentWords.filter(function (w) { return !savedSet[w]; });
            if (newWords.length > 0) {
                // Append new words in shuffled order
                var shuffledNew = shuffle(newWords);
                var updatedOrder = savedOrder.concat(shuffledNew);
                // Save updated order in background
                supabase.from('user_word_order')
                    .update({ word_order: JSON.stringify(updatedOrder) })
                    .eq('user_id', currentUser.id)
                    .then(function() {}, function(e) { console.error(e); });
                return updatedOrder;
            }
            return savedOrder;
        }
        // First time: generate random order, save in background (don't block quiz start)
        var order = shuffle(words).map(function (w) { return w.word; });
        supabase.from('user_word_order').insert({
            user_id: currentUser.id,
            word_order: JSON.stringify(order)
        }).catch(function (e) { console.error('Failed to save word order:', e); });
        return order;
    }

    async function startNewQuiz() {
        if (!words.length) return;
        // Mark old unfinished sessions as completed (don't block)
        if (supabase && currentUser) {
            supabase.from('quiz_sessions')
                .update({ completed: true })
                .eq('user_id', currentUser.id)
                .eq('completed', false)
                .then(function () {}, function (e) { console.error(e); });
        }

        currentIndex = 0;
        correctCount = 0;
        wrongWords = [];

        if (supabase && currentUser) {
            var order = await getUserWordOrder();
            quizWords = order.map(function (w) {
                return words.find(function (ww) { return ww.word === w; });
            }).filter(Boolean);

            var sessionId = Date.now().toString(36) + Math.random().toString(36).slice(2);
            // Save session in background
            currentSessionId = sessionId;
            supabase.from('quiz_sessions').insert({
                id: sessionId,
                user_id: currentUser.id,
                word_order: JSON.stringify(order),
                completed: false
            }).catch(function (e) { console.error('Failed to create session:', e); });
        } else {
            quizWords = shuffle(words);
        }

        showPage('quiz-page');
        showQuestion();
    }

    async function resumeQuiz(session) {
        var order = JSON.parse(session.word_order);
        // Rebuild quizWords, including any new words not in original order
        var currentWords = words.map(function (w) { return w.word; });
        var orderSet = {};
        order.forEach(function (w) { orderSet[w] = true; });
        var newWords = currentWords.filter(function (w) { return !orderSet[w]; });
        if (newWords.length > 0) {
            order = order.concat(shuffle(newWords));
        }

        // Load all answers for this session (including old records with null session_id)
        var { data: answers } = await supabase
            .from('progress')
            .select('word, correct')
            .eq('user_id', currentUser.id)
            .in('session_id', [session.id, null]);

        var answered = {};
        if (answers) {
            answers.forEach(function (a) { answered[a.word] = a.correct; });
        }

        // Rebuild quizWords in saved order + new words
        quizWords = order.map(function (w) {
            return words.find(function (ww) { return ww.word === w; });
        }).filter(Boolean);

        currentIndex = 0;
        correctCount = 0;
        wrongWords = [];

        // Skip to first unanswered word, counting correct/wrong
        for (var i = 0; i < quizWords.length; i++) {
            if (answered[quizWords[i].word] === undefined) break;
            if (answered[quizWords[i].word]) correctCount++;
            else wrongWords.push(quizWords[i]);
            currentIndex = i + 1;
        }

        currentSessionId = session.id;

        if (currentIndex >= quizWords.length) {
            // All done somehow
            await supabase.from('quiz_sessions').update({ completed: true }).eq('id', session.id);
            showHome();
            return;
        }

        showPage('quiz-page');
        showQuestion();
    }

    function showQuestion() {
        var word = quizWords[currentIndex];
        var total = quizWords.length;
        document.getElementById('progress-text').textContent = (currentIndex + 1) + ' / ' + total;
        document.getElementById('progress-fill').style.width = ((currentIndex + 1) / total * 100) + '%';
        document.getElementById('quiz-word').textContent = word.word;

        var distractors = shuffle(words.filter(function (w) { return w.word !== word.word; })).slice(0, 3);
        var options = shuffle([word].concat(distractors));
        var labels = ['A', 'B', 'C', 'D'];
        var container = document.getElementById('quiz-options');
        container.innerHTML = '';

        options.forEach(function (opt, i) {
            var div = document.createElement('div');
            div.className = 'quiz-option';
            div.innerHTML = '<span class="option-label">' + labels[i] + '</span><span class="option-text">' + opt.definition + '</span>';
            div.dataset.word = opt.word;
            div.addEventListener('click', function () { handleAnswer(div, opt.word === word.word, word); });
            container.appendChild(div);
        });
    }

    async function handleAnswer(el, isCorrect, wordObj) {
        var allOptions = document.querySelectorAll('.quiz-option');
        allOptions.forEach(function (opt) {
            opt.classList.add('disabled');
            if (opt.dataset.word === wordObj.word) {
                opt.classList.add('correct');
            }
        });
        if (!isCorrect) {
            el.classList.add('wrong');
            wrongWords.push(wordObj);
            playSound(false);
        } else {
            correctCount++;
            playSound(true);
        }

        await saveAnswer(wordObj, isCorrect);

        setTimeout(function () {
            currentIndex++;
            if (currentIndex < quizWords.length) {
                showQuestion();
            } else {
                showResults();
            }
        }, 600);
    }

    async function saveAnswer(wordObj, isCorrect) {
        if (!supabase || !currentUser) return;
        try {
            await supabase.from('progress').insert({
                user_id: currentUser.id,
                word: wordObj.word,
                correct: isCorrect,
                session_id: currentSessionId,
                answered_at: new Date().toISOString()
            });
        } catch (e) {
            console.error('Failed to save answer:', e);
        }
    }

    function showResults() {
        var total = quizWords.length;
        var pct = Math.round(correctCount / total * 100);
        document.getElementById('results-correct').textContent = correctCount;
        document.getElementById('results-total').textContent = total;
        document.getElementById('results-percentage').textContent = pct + '% correct';

        var wrongSection = document.getElementById('wrong-words-section');
        var wrongList = document.getElementById('wrong-words-list');
        if (wrongWords.length > 0) {
            wrongSection.classList.remove('hidden');
            wrongList.innerHTML = '';
            wrongWords.forEach(function (w) {
                var div = document.createElement('div');
                div.className = 'wrong-word-item';
                div.innerHTML = '<span class="wrong-word-eng">' + w.word + '</span><span class="wrong-word-chn">' + w.definition + '</span>';
                wrongList.appendChild(div);
            });
        } else {
            wrongSection.classList.add('hidden');
        }

        showPage('results-page');
        completeSession();
    }

    function completeSession() {
        if (supabase && currentUser && currentSessionId) {
            supabase.from('quiz_sessions').update({ completed: true }).eq('id', currentSessionId)
                .catch(function (e) { console.error('Failed to complete session:', e); });
        }
    }

    function downloadWrongWords() {
        var content = wrongWords.map(function (w) { return w.word + '\t' + w.definition; }).join('\n');
        var blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'wrong_words.txt';
        a.click();
        URL.revokeObjectURL(url);
    }

    async function loadHistory() {
        if (!supabase || !currentUser) return;
        try {
            var { data, error } = await supabase
                .from('quiz_sessions')
                .select('id, created_at, completed')
                .eq('user_id', currentUser.id)
                .order('created_at', { ascending: false });
            if (error || !data || !data.length) {
                document.getElementById('history-section').classList.add('hidden');
                return;
            }

            var list = data.slice(0, 10);
            var container = document.getElementById('history-list');
            container.innerHTML = '';

            for (var i = 0; i < list.length; i++) {
                var s = list[i];
                var { data: answers } = await supabase
                    .from('progress')
                    .select('correct')
                    .eq('session_id', s.id);
                var total = answers ? answers.length : 0;
                var correct = answers ? answers.filter(function (a) { return a.correct; }).length : 0;
                if (total === 0) continue;

                var div = document.createElement('div');
                div.className = 'history-item';
                var d = new Date(s.created_at);
                var dateStr = d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                var status = s.completed ? '' : ' (unfinished)';
                div.innerHTML = '<span class="history-date">' + dateStr + status + '</span><span class="history-score">' + correct + '/' + total + ' (' + Math.round(correct / total * 100) + '%)</span>';
                container.appendChild(div);
            }

            if (container.children.length) {
                document.getElementById('history-section').classList.remove('hidden');
            } else {
                document.getElementById('history-section').classList.add('hidden');
            }
        } catch (e) {
            console.error('Failed to load history:', e);
        }
    }

    function showQuizStats() {
        var answered = correctCount + wrongWords.length;
        var total = quizWords.length;
        document.getElementById('quiz-stats-summary').textContent =
            'Answered: ' + answered + ' / ' + total + '  |  Correct: ' + correctCount + '  |  Wrong: ' + wrongWords.length;

        var correctList = document.getElementById('quiz-correct-list');
        correctList.innerHTML = '';
        if (correctCount === 0) {
            correctList.innerHTML = '<p style="color:#999;font-size:13px;">No correct answers yet.</p>';
        } else {
            // Show answered correct words from quizWords[0..currentIndex]
            var wrongSet = {};
            wrongWords.forEach(function (w) { wrongSet[w.word] = true; });
            for (var i = 0; i < currentIndex && i < quizWords.length; i++) {
                if (!wrongSet[quizWords[i].word]) {
                    var div = document.createElement('div');
                    div.className = 'wrong-word-item';
                    div.innerHTML = '<span class="wrong-word-eng">' + quizWords[i].word + '</span><span class="wrong-word-chn">' + quizWords[i].definition + '</span>';
                    correctList.appendChild(div);
                }
            }
        }

        var wrongList = document.getElementById('quiz-wrong-list');
        wrongList.innerHTML = '';
        if (wrongWords.length === 0) {
            wrongList.innerHTML = '<p style="color:#999;font-size:13px;">No wrong answers yet.</p>';
        } else {
            wrongWords.forEach(function (w) {
                var div = document.createElement('div');
                div.className = 'wrong-word-item';
                div.innerHTML = '<span class="wrong-word-eng">' + w.word + '</span><span class="wrong-word-chn">' + w.definition + '</span>';
                wrongList.appendChild(div);
            });
        }

        document.getElementById('quiz-stats-modal').classList.remove('hidden');
    }

    function hideQuizStats() {
        document.getElementById('quiz-stats-modal').classList.add('hidden');
    }

    function downloadWordList(type) {
        var list = [];
        if (type === 'correct') {
            var wrongSet = {};
            wrongWords.forEach(function (w) { wrongSet[w.word] = true; });
            for (var i = 0; i < currentIndex && i < quizWords.length; i++) {
                if (!wrongSet[quizWords[i].word]) list.push(quizWords[i]);
            }
        } else {
            list = wrongWords;
        }
        var content = list.map(function (w) { return w.word + '\t' + w.definition; }).join('\n');
        var blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = type + '_words.txt';
        a.click();
        URL.revokeObjectURL(url);
    }

    document.addEventListener('DOMContentLoaded', init);
})();

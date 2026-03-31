(function () {
    let supabase;
    let currentUser = null;
    let words = [];
    let quizWords = [];
    let currentIndex = 0;
    let correctCount = 0;
    let wrongWords = [];

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
        document.getElementById('start-quiz-btn').addEventListener('click', startQuiz);
        document.getElementById('try-again-btn').addEventListener('click', startQuiz);
        document.getElementById('home-btn').addEventListener('click', showHome);
        document.getElementById('download-wrong-btn').addEventListener('click', downloadWrongWords);

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
        // Auto-login if no email confirmation required
        if (data.user && data.session) {
            currentUser = data.user;
            showHome();
        } else {
            showAuthError('Account created! Please check your email to confirm, then login.');
        }
    }

    async function handleLogout() {
        await supabase.auth.signOut();
        currentUser = null;
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

    function showHome() {
        document.getElementById('user-info').textContent = currentUser ? currentUser.email : '';
        showPage('home-page');
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

    function startQuiz() {
        if (!words.length) return;
        quizWords = shuffle(words);
        currentIndex = 0;
        correctCount = 0;
        wrongWords = [];
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

    function handleAnswer(el, isCorrect, wordObj) {
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
        } else {
            correctCount++;
        }

        setTimeout(function () {
            currentIndex++;
            if (currentIndex < quizWords.length) {
                showQuestion();
            } else {
                showResults();
            }
        }, 1200);
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
        saveProgress();
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

    async function saveProgress() {
        if (!supabase || !currentUser) return;
        var now = new Date().toISOString();
        var records = quizWords.map(function (w) {
            var correct = wrongWords.some(function (ww) { return ww.word === w.word; }) ? false : true;
            return { user_id: currentUser.id, word: w.word, correct: correct, answered_at: now };
        });
        try {
            await supabase.from('progress').insert(records);
        } catch (e) {
            console.error('Failed to save progress:', e);
        }
    }

    async function loadHistory() {
        if (!supabase || !currentUser) return;
        try {
            var { data, error } = await supabase
                .from('progress')
                .select('answered_at, correct')
                .eq('user_id', currentUser.id)
                .order('answered_at', { ascending: false });
            if (error || !data || !data.length) {
                document.getElementById('history-section').classList.add('hidden');
                return;
            }

            var quizzes = {};
            data.forEach(function (row) {
                var key = row.answered_at.slice(0, 16);
                if (!quizzes[key]) quizzes[key] = { total: 0, correct: 0, date: row.answered_at };
                quizzes[key].total++;
                if (row.correct) quizzes[key].correct++;
            });

            var list = Object.values(quizzes).sort(function (a, b) {
                return b.date.localeCompare(a.date);
            }).slice(0, 10);

            if (!list.length) {
                document.getElementById('history-section').classList.add('hidden');
                return;
            }

            var container = document.getElementById('history-list');
            container.innerHTML = '';
            list.forEach(function (q) {
                var div = document.createElement('div');
                div.className = 'history-item';
                var d = new Date(q.date);
                var dateStr = d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                div.innerHTML = '<span class="history-date">' + dateStr + '</span><span class="history-score">' + q.correct + '/' + q.total + ' (' + Math.round(q.correct / q.total * 100) + '%)</span>';
                container.appendChild(div);
            });
            document.getElementById('history-section').classList.remove('hidden');
        } catch (e) {
            console.error('Failed to load history:', e);
        }
    }

    document.addEventListener('DOMContentLoaded', init);
})();

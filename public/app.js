// public/app.js
(async () => {
  const numberInput = document.getElementById('number');
  const generateBtn = document.getElementById('generate');
  const resultBox = document.getElementById('result');
  const copyBtn = document.getElementById('copy');

  const API_KEY = ''; // If you deploy with API_KEY, set it in the fetch headers or append ?key=...

  generateBtn.addEventListener('click', async () => {
    const num = numberInput.value.trim();
    if (!/^\d{8,15}$/.test(num)) { resultBox.textContent = 'Numéro invalide (8-15 chiffres)'; return; }
    resultBox.textContent = '⏳ Génération du pairing code...';
    try {
      const url = `/pair?number=${encodeURIComponent(num)}`;
      const opts = API_KEY ? { headers: { Authorization: 'Bearer ' + API_KEY } } : {};
      const res = await fetch(url, opts);
      const data = await res.json();
      if (!res.ok) {
        resultBox.textContent = data.error || 'Erreur serveur';
      } else {
        resultBox.textContent = data.code || 'Aucun code trouvé';
      }
    } catch (e) {
      resultBox.textContent = 'Erreur réseau: ' + e.message;
    }
  });

  copyBtn.addEventListener('click', async () => {
    const txt = resultBox.textContent || '';
    try {
      await navigator.clipboard.writeText(txt);
      copyBtn.textContent = '✅ Copied';
      setTimeout(()=> copyBtn.textContent = '📋 Copy Code', 1500);
    } catch (e) {
      copyBtn.textContent = '✖ Failed';
      setTimeout(()=> copyBtn.textContent = '📋 Copy Code', 1500);
    }
  });
})();

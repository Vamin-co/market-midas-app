  fetch('http://localhost:3001/api/search?q=aapl')
    .then(r => r.json())
    .then(console.log)
    .catch(console.error);

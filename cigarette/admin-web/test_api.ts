import http from 'http';

async function test() {
  const res = await fetch('http://localhost:7011/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phoneNumber: 'admin', password: 'admin_next9' })
  });
  const data = await res.json();
  const token = data.data?.token;
  console.log("Token:", token ? "Got token" : "Failed");

  if (!token) return;

  const overviewRes = await fetch('http://localhost:7011/api/analytics/overview', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const overviewData = await overviewRes.json();
  console.log("Overview data KPIs:", JSON.stringify(overviewData.data?.kpis, null, 2));
}

test();

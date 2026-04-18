const axios = require('axios');
async function test() {
  const login = await axios.post('http://localhost:5000/api/auth/login', { email: 'BT23CSE001@aimsreg.edu', password: 'password123', role: 'student' });
  const token = login.data.token;
  const user = login.data.user;
  const courses = await axios.get('http://localhost:5000/api/lookup/courses?studentId=' + user.id, { headers: { Authorization: "Bearer " + token } });
  console.log(courses.data);
}
test().catch(console.error);

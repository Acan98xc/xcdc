document.getElementById('login-form').addEventListener('submit', async (event) => {
    event.preventDefault();

    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;

    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });
        console.log(response);

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error)
        }
        localStorage.setItem('token', data.token); // 存储 JWT
        localStorage.setItem('uname', username); // 存储用户名

        window.location.href = 'index.html'; // 登录成功后重定向到首页
    } catch (error) {
        alert(error.message, 88);
    }
}); 
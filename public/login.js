document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();

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

        const data = await response.json();

        if (response.ok) {
            // 保存token和用户名
            localStorage.setItem('token', data.token);
            localStorage.setItem('username', username);

            // 跳转到主页
            window.location.href = 'index.html';
        } else {
            showLoginError(data.error || '用户名或密码错误');
        }
    } catch (error) {
        console.error('登录失败:', error);
        showLoginError('登录失败，请稍后重试');
    }
});

// 显示登录错误提示弹窗
function showLoginError(message) {
    const modal = document.createElement('div');
    modal.className = 'login-modal';
    modal.innerHTML = `
        <div class="modal-content error">
            <p>${message}</p>
            <button onclick="closeLoginModal(this)" class="close-btn">确定</button>
        </div>
    `;
    document.body.appendChild(modal);

    // 添加动画效果
    setTimeout(() => modal.classList.add('show'), 10);
}

// 关闭登录错误弹窗
function closeLoginModal(button) {
    const modal = button.closest('.login-modal');
    modal.classList.remove('show');
    setTimeout(() => modal.remove(), 300);
} 
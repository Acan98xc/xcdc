document.addEventListener('DOMContentLoaded', () => {
    // 默认显示菜品管理部分
    showSection('dishes');

    // 导航点击事件
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', function (e) {
            e.preventDefault();
            const section = this.dataset.section;
            showSection(section);

            // 更新导航状态
            document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
            this.classList.add('active');
        });
    });

    // 加载初始数据
    loadDishes();

    // 初始化筛选器
    initFilters();

    // 初始化音频上下文
    initAudioContext();

    // 初始化声音设置
    const savedSoundSetting = localStorage.getItem('soundEnabled');
    if (savedSoundSetting !== null) {
        soundEnabled = savedSoundSetting === 'true';
        const button = document.getElementById('toggle-sound');
        button.classList.toggle('sound-muted', !soundEnabled);
        button.querySelector('.sound-icon').textContent = soundEnabled ? '🔔' : '🔕';
    }

    // 添加声音切换按钮事件监听
    document.getElementById('toggle-sound').addEventListener('click', toggleSound);

    // 初始化 WebSocket 连接
    initWebSocket();
});

// 显示指定部分
function showSection(sectionId) {
    // 隐藏所有部分
    document.querySelectorAll('.admin-section').forEach(section => {
        section.style.display = 'none';
    });

    // 显示选中的部分
    const selectedSection = document.getElementById(`${sectionId}-section`);
    if (selectedSection) {
        selectedSection.style.display = 'block';
    }
}

// 声明 WebSocket 变量
let ws;

// 修改 WebSocket 连接初始化
function initWebSocket() {
    // 确保之前的连接已关闭
    if (ws) {
        ws.close();
    }

    // 创建新的 WebSocket 连接
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    console.log('Connecting to WebSocket:', wsUrl);

    ws = new WebSocket(wsUrl);

    ws.onopen = function () {
        console.log('WebSocket 连接已建立');
    };

    ws.onmessage = function (event) {
        console.log('收到WebSocket消息:', event.data);
        try {
            const data = JSON.parse(event.data);
            if (data.type === 'new_order') {
                // 显示通知并播放提示音
                showNotification('收到新订单！');
                playNotificationSound();

                // 如果当前在订单页面，自动刷新订单列表
                if (document.getElementById('orders-section').style.display !== 'none') {
                    loadOrders();
                }
            }
        } catch (error) {
            console.error('处理WebSocket消息失败:', error);
        }
    };

    ws.onclose = function () {
        console.log('WebSocket连接已关闭，尝试重新连接...');
        setTimeout(initWebSocket, 3000);
    };

    ws.onerror = function (error) {
        console.error('WebSocket错误:', error);
    };
}

// 添加关闭通知的函数
function dismissNotification() {
    const notification = document.getElementById('notification');
    notification.classList.remove('show');
    setTimeout(() => {
        notification.style.display = 'none';
    }, 300);
}

// 修改显示通知的函数，添加自动关闭和手动关闭功能
function showNotification(message, type = 'success') {
    const notification = document.getElementById('notification');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
        <p>${message}</p>
        <button onclick="dismissNotification()" class="notification-close">知道了</button>
    `;
    notification.style.display = 'block';
    notification.classList.add('show');

    // 5秒后自动隐藏
    const autoHideTimeout = setTimeout(() => {
        dismissNotification();
    }, 5000);

    // 如果用户手动关闭，清除自动隐藏的计时器
    notification.querySelector('button').addEventListener('click', () => {
        clearTimeout(autoHideTimeout);
    });
}

// 添加备用通知声音函数
function fallbackNotificationSound() {
    // 使用简单的 Web Audio API 生成提示音
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(880, audioContext.currentTime); // A5 音符

        gainNode.gain.setValueAtTime(0.5, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.5);
    } catch (err) {
        console.log('备用提示音也无法播放:', err);
    }
}

// 导航功能
document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', function (e) {
        e.preventDefault();
        const section = this.dataset.section;
        showSection(section);

        // 更新导航状态
        document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
        this.classList.add('active');
    });
});

// 图片预览功能
document.getElementById('dish-image').addEventListener('change', function (e) {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function (e) {
            const preview = document.getElementById('dish-image-preview');
            preview.src = e.target.result;
            preview.style.display = 'block';
        }
        reader.readAsDataURL(file);
    }
});

// 修改筛选相关变量
let currentFilters = {
    status: 'all',
    dateRange: 'today',
    startDate: null,
    endDate: null
};

// 初始化筛选器
function initFilters() {
    const dateRangeSelect = document.getElementById('date-range');
    const customDateRange = document.querySelector('.custom-date-range');

    // 日期范围选择事件
    dateRangeSelect.addEventListener('change', function () {
        if (this.value === 'custom') {
            customDateRange.style.display = 'flex';
        } else {
            customDateRange.style.display = 'none';
            // 自动设置对应的日期范围
            setDateRange(this.value);
        }
    });

    // 初始化日期范围
    setDateRange('today');
}

// 设置日期范围
function setDateRange(range) {
    const today = new Date();
    let startDate = new Date();
    let endDate = new Date();

    switch (range) {
        case 'today':
            startDate.setHours(0, 0, 0, 0);
            endDate.setHours(23, 59, 59, 999);
            break;
        case 'yesterday':
            startDate.setDate(today.getDate() - 1);
            startDate.setHours(0, 0, 0, 0);
            endDate = new Date(startDate);
            endDate.setHours(23, 59, 59, 999);
            break;
        case 'week':
            startDate.setDate(today.getDate() - today.getDay());
            startDate.setHours(0, 0, 0, 0);
            endDate.setHours(23, 59, 59, 999);
            break;
        case 'month':
            startDate.setDate(1);
            startDate.setHours(0, 0, 0, 0);
            endDate.setHours(23, 59, 59, 999);
            break;
        case 'custom':
            return; // 不设置日期，使用用户输入
    }

    document.getElementById('start-date').value = formatDate(startDate);
    document.getElementById('end-date').value = formatDate(endDate);
}

// 格式化日期为 YYYY-MM-DD
function formatDate(date) {
    return date.toISOString().split('T')[0];
}

// 修改应用筛选函数
async function applyFilters() {
    const status = document.getElementById('order-status-filter').value;
    const dateRange = document.getElementById('date-range').value;
    const startDate = document.getElementById('start-date').value;
    const endDate = document.getElementById('end-date').value;

    currentFilters = {
        status,
        dateRange,
        startDate,
        endDate
    };

    await loadOrders();
}

// 修改重置筛选函数
function resetFilters() {
    document.getElementById('order-status-filter').value = 'all';
    document.getElementById('date-range').value = 'today';
    setDateRange('today');
    document.querySelector('.custom-date-range').style.display = 'none';

    currentFilters = {
        status: 'all',
        dateRange: 'today',
        startDate: null,
        endDate: null
    };

    loadOrders();
}

// 修改加载订单列表函数
async function loadOrders() {
    try {
        const queryParams = new URLSearchParams({
            status: currentFilters.status,
            startDate: currentFilters.startDate || '',
            endDate: currentFilters.endDate || ''
        });

        const response = await fetch(`/api/admin/orders?${queryParams}`);
        const orders = await response.json();

        renderOrderList(orders);
    } catch (error) {
        console.error('加载订单失败:', error);
    }
}

// 更新订单状态
async function updateOrderStatus(orderId, newStatus) {
    try {
        const response = await fetch(`/api/admin/orders/${orderId}/status`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ status: newStatus })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || '更新状态失败');
        }

        // 更新成功后刷新订单列表
        await loadOrders();

        // 显示成功提示
        showNotification('订单状态已更新');
    } catch (error) {
        console.error('更新订单状态失败:', error);
        showNotification('更新订单状态失败: ' + error.message, 'error');
    }
}

// 显示订单详情
async function showOrderDetails(orderId) {
    try {
        const response = await fetch(`/api/admin/orders/${orderId}`);
        if (!response.ok) {
            throw new Error('获取订单详情失败');
        }
        const order = await response.json();

        const modal = document.getElementById('order-modal');
        const details = document.getElementById('order-details');

        details.innerHTML = `
            <div class="order-detail-header">
                <h4>订单 #${order.id}</h4>
                <span class="order-status status-${order.status || 'pending'}">${getStatusText(order.status || 'pending')}</span>
            </div>
            <div class="order-detail-info">
                <p>下单时间: ${new Date(order.order_date).toLocaleString()}</p>
                <p>订单状态: ${getStatusText(order.status || 'pending')}</p>
            </div>
            <div class="order-detail-items">
                <h5>订单内容</h5>
                <table class="order-items-table">
                    <thead>
                        <tr>
                            <th>菜品</th>
                            <th>数量</th>
                            <th>单价</th>
                            <th>小计</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${order.items.map(item => `
                            <tr>
                                <td>${item.name}</td>
                                <td>${item.quantity}</td>
                                <td>¥${item.price}</td>
                                <td>¥${(item.price * item.quantity).toFixed(2)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                    <tfoot>
                        <tr>
                            <td colspan="3">总计</td>
                            <td>¥${order.total_amount}</td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        `;

        showModal(modal);
    } catch (error) {
        console.error('加载订单详情失败:', error);
        showNotification('加载订单详情失败', 'error');
    }
}

// 初始化订单筛选器事件监听
document.addEventListener('DOMContentLoaded', () => {
    const statusFilter = document.getElementById('order-status-filter');
    const dateFilter = document.getElementById('order-date-filter');

    if (statusFilter) {
        statusFilter.addEventListener('change', loadOrders);
    }
    if (dateFilter) {
        dateFilter.addEventListener('change', loadOrders);
    }
});

// 加载统计数据
async function loadStats() {
    try {
        const period = document.getElementById('stats-period').value;
        const response = await fetch(`/api/admin/stats?period=${period}`);
        const stats = await response.json();

        // 更新营业额统计
        document.getElementById('revenue-stats').innerHTML = `
            <h4>总营业额: ¥${stats.totalRevenue}</h4>
            <h4>订单数: ${stats.orderCount}</h4>
            <h4>平均订单金额: ¥${stats.averageOrderAmount}</h4>
        `;

        // 更新热销菜品
        document.getElementById('popular-dishes').innerHTML = stats.popularDishes
            .map(dish => `
                <div class="popular-dish-item">
                    <span>${dish.name}</span>
                    <span>销量: ${dish.count}</span>
                </div>
            `).join('');
    } catch (error) {
        console.error('加载统计数据失败:', error);
    }
}

// 辅助数
function getStatusText(status) {
    const statusMap = {
        'pending': '待处理',
        'processing': '处理中',
        'completed': '已完成'
    };
    return statusMap[status] || status;
}

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    loadDishes();
    loadOrders();
    loadStats();
});

// 加载菜品列表
async function loadDishes() {
    try {
        const response = await fetch('/api/admin/dishes');
        const dishes = await response.json();

        const container = document.getElementById('dishes-list');
        container.innerHTML = dishes.map(dish => `
            <div class="dish-card">
                <img src="${dish.image_url || '/images/default-dish.jpg'}" alt="${dish.name}" class="dish-image">
                <div class="dish-info">
                    <h3>${dish.name}</h3>
                </div>
                <div class="dish-actions">
                    <button onclick="editDish(${dish.id})" class="btn btn-edit">编辑</button>
                    <button onclick="deleteDish(${dish.id})" class="btn btn-delete">删除</button>
                </div>
            </div>
        `).join('');
    } catch (error) {
        console.error('加载菜品失败:', error);
    }
}

// 显示模态框
function showModal(modal) {
    if (modal) {
        modal.style.display = 'flex';
        // 触发重排以启动过渡动画
        modal.offsetHeight;
        modal.classList.add('show');
    }
}

// 隐藏模态框
function hideModal(modal) {
    if (modal) {
        modal.classList.remove('show');
        setTimeout(() => {
            modal.style.display = 'none';
        }, 300); // 等待过渡动画完成
    }
}

// 修改 showDishForm
function showDishForm(dish = null) {
    const modal = document.getElementById('dish-modal');
    const form = document.getElementById('dish-form');
    const preview = document.getElementById('dish-image-preview');

    if (!modal || !form) {
        console.error('Modal or form elements not found');
        return;
    }

    // 重置表单
    form.reset();
    preview.style.display = 'none';

    // 设置表单数据
    if (dish) {
        document.getElementById('dish-id').value = dish.id;
        document.getElementById('dish-name').value = dish.name;
        document.getElementById('dish-price').value = dish.price;
        if (dish.image_url) {
            preview.src = dish.image_url;
            preview.style.display = 'block';
        }
    } else {
        document.getElementById('dish-id').value = '';
    }

    // 显示模态框
    showModal(modal);
}

// 修改 hideDishForm
function hideDishForm() {
    const modal = document.getElementById('dish-modal');
    hideModal(modal);
}

// 编辑菜品
async function editDish(id) {
    try {
        const response = await fetch(`/api/admin/dishes/${id}`);
        const dish = await response.json();
        showDishForm(dish);
    } catch (error) {
        console.error('获取菜品详情失败:', error);
    }
}

// 删除菜品
async function deleteDish(id) {
    if (!confirm('确定要删除这个菜品吗？')) return;

    try {
        const response = await fetch(`/api/admin/dishes/${id}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            loadDishes(); // 重新加载菜品列表
        } else {
            throw new Error('删除失败');
        }
    } catch (error) {
        console.error('删除菜品失败:', error);
    }
}

// 处理菜品表单提交
async function handleDishSubmit(event) {
    event.preventDefault();

    const formData = new FormData();
    const id = document.getElementById('dish-id').value;
    const name = document.getElementById('dish-name').value;
    const price = document.getElementById('dish-price').value;
    const imageFile = document.getElementById('dish-image').files[0];

    formData.append('name', name);
    formData.append('price', price);
    if (imageFile) {
        formData.append('image', imageFile);
    }

    try {
        const url = id ? `/api/admin/dishes/${id}` : '/api/admin/dishes';
        const method = id ? 'PUT' : 'POST';

        const response = await fetch(url, {
            method: method,
            body: formData
        });

        if (response.ok) {
            hideDishForm();
            loadDishes(); // 重新加载菜品列表
        } else {
            throw new Error('保存失败');
        }
    } catch (error) {
        console.error('保存菜品失败:', error);
    }
}

// 添加点击模态框部关闭功能
document.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById('dish-modal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                hideDishForm();
            }
        });
    }

    // 添加订单模态框的点击关闭功能
    const orderModal = document.getElementById('order-modal');
    if (orderModal) {
        orderModal.addEventListener('click', (e) => {
            if (e.target === orderModal) {
                hideOrderModal();
            }
        });
    }
});

// 修改订单列表渲染，添加状态样式
function renderOrderList(orders) {
    const container = document.getElementById('orders-list');
    container.innerHTML = orders.map(order => `
        <div class="order-card">
            <div class="order-header">
                <h3>订单 #${order.id}</h3>
                <div class="order-status-actions">
                    <span class="order-status status-${order.status || 'pending'}">${getStatusText(order.status || 'pending')}</span>
                    <select onchange="updateOrderStatus(${order.id}, this.value)" class="status-select"
                            ${order.status === 'completed' ? 'disabled' : ''}>
                        <option value="pending" ${order.status === 'pending' ? 'selected' : ''}>待处理</option>
                        <option value="processing" ${order.status === 'processing' ? 'selected' : ''}>处理中</option>
                        <option value="completed" ${order.status === 'completed' ? 'selected' : ''}>已完成</option>
                    </select>
                </div>
            </div>
            <div class="order-info">
                <p>下单时间: ${new Date(order.order_date).toLocaleString()}</p>
            </div>
            <div class="order-items">
                ${order.items}
            </div>
            <div class="order-actions">
                <button onclick="showOrderDetails(${order.id})" class="btn btn-info">查看详情</button>
            </div>
        </div>
    `).join('');
}

// 隐藏订单详情模态框
function hideOrderModal() {
    const modal = document.getElementById('order-modal');
    hideModal(modal);
}

// 添加声音提示功能
let audioContext = null;
let audioInitialized = false;

// 初始化音频上下文
function initAudioContext() {
    try {
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }

        // 如果上下文被挂起，尝试恢复
        if (audioContext.state === 'suspended') {
            audioContext.resume();
        }

        audioInitialized = true;
    } catch (error) {
        console.error('Web Audio API 不支持:', error);
        audioInitialized = false;
    }
}

// 在用户第一次点击声音按钮时初始化音频
function toggleSound() {
    const button = document.getElementById('toggle-sound');
    soundEnabled = !soundEnabled;

    // 第一次启用声音时初始化音频上下文
    if (soundEnabled && !audioInitialized) {
        initAudioContext();
    }

    // 更新按钮状态
    button.classList.toggle('sound-muted', !soundEnabled);
    button.querySelector('.sound-icon').textContent = soundEnabled ? '🔔' : '🔕';

    // 保存设置到本地存储
    localStorage.setItem('soundEnabled', soundEnabled);

    // 显示提示
    showNotification(soundEnabled ? '已开启声音提示' : '已关闭声音提示', 'info');

    // 如果开启声音，播放一个测试音
    if (soundEnabled) {
        playTestSound();
    }
}

// 播放测试音
function playTestSound() {
    if (!audioContext || audioContext.state === 'suspended') {
        initAudioContext();
    }

    try {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(440, audioContext.currentTime); // A4 音符
        gainNode.gain.setValueAtTime(0.1, audioContext.currentTime); // 较低的音量
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.3);
    } catch (error) {
        console.error('播放测试音失败:', error);
    }
}

// 修改播放通知声音函数
function playNotificationSound() {
    // 如果声音被禁用，直接返回
    if (!soundEnabled) {
        return;
    }

    // 确保音频上下文已初始化且处于可用状态
    if (!audioContext || audioContext.state === 'suspended') {
        console.warn('音频上下文未初始化或已挂起，尝试使用备用声音');
        playFallbackSound();
        return;
    }

    try {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(880, audioContext.currentTime);
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.5);
    } catch (error) {
        console.error('播放提示音失败:', error);
        playFallbackSound();
    }
}

// 声音设置
let soundEnabled = true; 
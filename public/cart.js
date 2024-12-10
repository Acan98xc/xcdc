
// 从localStorage获取购物车数据
let cart = JSON.parse(localStorage.getItem('cart')) || [];

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
    // 初始化通用功能
    window.commonUtils.initCommon();
    // 显示购物车
    displayCart();
});

// 显示购物车内容
async function displayCart() {
    const cartItemsElement = document.getElementById('cart-items');
    const submitButton = document.getElementById('submit-order');

    if (cart.length === 0) {
        cartItemsElement.innerHTML = '<li class="empty-cart">购物车是空的</li>';
        if (submitButton) {
            submitButton.disabled = true;
        }
        return;
    }

    try {
        // 获取最新的菜品信息
        const response = await fetch('/api/menu');
        const menuData = await response.json();
        const menuItems = menuData.items;

        // 创建菜品ID到菜品信息的映射
        const menuItemsMap = {};
        menuItems.forEach(item => {
            menuItemsMap[item.id] = item;
        });

        // 生成购物车HTML
        const cartHTML = cart.map(item => {
            const menuItem = menuItemsMap[item.id];
            if (!menuItem) return ''; // 如果菜品不存在，跳过

            return `
                <li class="cart-item">
                    <div class="cart-item-info">
                        <span class="item-name">${menuItem.name}</span>
                        <span class="item-quantity">× ${item.quantity}</span>
                    </div>
                    <div class="cart-item-actions">
                        <button onclick="updateQuantity(${item.id}, -1)" class="quantity-btn">-</button>
                        <button onclick="updateQuantity(${item.id}, 1)" class="quantity-btn">+</button>
                        <button onclick="removeFromCart(${item.id})" class="remove-btn">删除</button>
                    </div>
                </li>
            `;
        }).join('');

        cartItemsElement.innerHTML = cartHTML;

        if (submitButton) {
            submitButton.disabled = cart.length === 0;
        }
    } catch (error) {
        console.error('获取菜单失败:', error);
        cartItemsElement.innerHTML = '<li class="error">加载购物车失败</li>';
    }
}

// 更新商品数量
function updateQuantity(itemId, change) {
    const itemIndex = cart.findIndex(item => item.id === itemId);
    if (itemIndex === -1) return;

    cart[itemIndex].quantity += change;

    if (cart[itemIndex].quantity <= 0) {
        cart.splice(itemIndex, 1);
    }

    // 保存到localStorage
    localStorage.setItem('cart', JSON.stringify(cart));
    // 更新显示
    displayCart();
}

// 从购物车中移除商品
function removeFromCart(itemId) {
    cart = cart.filter(item => item.id !== itemId);
    // 保存到localStorage
    localStorage.setItem('cart', JSON.stringify(cart));
    // 更新显示
    displayCart();
}

// 提交订单
async function submitOrder() {
    const submitButton = document.getElementById('submit-order');
    if (!submitButton || cart.length === 0) return;

    submitButton.disabled = true;
    submitButton.textContent = '提交中...';

    try {
        const response = await fetch('/api/orders', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                items: cart,
                initiator: localStorage.getItem('username')
            })
        });
        console.log(response);
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || response.statusText);
        }

        // 清空购物车
        cart = [];
        localStorage.removeItem('cart');
        displayCart();

        // 显示成功消息
        alert('订单提交成功！');

        // 恢复按钮状态
        submitButton.disabled = false;
        submitButton.textContent = '提交';
    } catch (error) {
        console.error('提交订单失败:', error);
        alert(`提交订单失败: ${error.message}`);
        submitButton.disabled = false;
        submitButton.textContent = '提交';
    }
} 
// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
    // 初始化通用功能
    window.commonUtils.initCommon();

    // 其他订单相关的初始化代码...
    loadOrders();
}); 
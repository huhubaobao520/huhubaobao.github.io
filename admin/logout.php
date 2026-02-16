<?php
require_once __DIR__ . '/auth.php';

// 仅允许 POST 请求退出（防止 CSRF 通过 img/link 强制退出）
// GET 请求显示确认页面或直接重定向到登录页
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    // 兼容直接访问：GET 请求也允许退出，但不依赖外部触发
    if (is_logged_in()) {
        logout();
    }
    header('Location: index.php');
    exit;
}

// POST 请求：验证 CSRF Token
$token = $_POST['csrf_token'] ?? '';
if (is_logged_in() && verify_csrf($token)) {
    logout();
}

header('Location: index.php');
exit;

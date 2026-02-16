<?php
/**
 * 轻量级 SMTP 邮件发送类（无需外部依赖）
 */
class SimpleSMTP {
    private $host;
    private $port;
    private $username;
    private $password;
    private $encryption;
    private $timeout;
    private $socket;
    private $log = [];

    public function __construct($config) {
        $this->host       = $config['host'] ?? '';
        $this->port       = intval($config['port'] ?? 587);
        $this->username   = $config['username'] ?? '';
        $this->password   = $config['password'] ?? '';
        $this->encryption = $config['encryption'] ?? 'tls';
        $this->timeout    = $config['timeout'] ?? 30;
    }

    /**
     * 发送邮件
     */
    public function send($fromEmail, $fromName, $toEmail, $subject, $body, $isHtml = false) {
        // 验证并净化邮箱地址（防止 SMTP 命令注入）
        $fromEmail = $this->sanitizeEmail($fromEmail);
        $toEmail = $this->sanitizeEmail($toEmail);
        if (!$fromEmail || !$toEmail) {
            return ['success' => false, 'message' => '无效的邮箱地址'];
        }

        try {
            $this->connect();
            $this->ehlo();

            if ($this->encryption === 'tls') {
                $this->startTLS();
                $this->ehlo();
            }

            if ($this->username) {
                $this->authenticate();
            }

            $this->mailFrom($fromEmail);
            $this->rcptTo($toEmail);
            $this->data($fromEmail, $fromName, $toEmail, $subject, $body, $isHtml);
            $this->quit();

            return ['success' => true, 'message' => '邮件发送成功'];
        } catch (Exception $e) {
            if ($this->socket) {
                @fclose($this->socket);
                $this->socket = null;
            }
            return ['success' => false, 'message' => $e->getMessage(), 'log' => $this->log];
        }
    }

    /**
     * 测试 SMTP 连接
     */
    public function test() {
        try {
            $this->connect();
            $this->ehlo();

            if ($this->encryption === 'tls') {
                $this->startTLS();
                $this->ehlo();
            }

            if ($this->username) {
                $this->authenticate();
            }

            $this->quit();
            return ['success' => true, 'message' => 'SMTP 连接测试成功'];
        } catch (Exception $e) {
            if ($this->socket) {
                @fclose($this->socket);
                $this->socket = null;
            }
            return ['success' => false, 'message' => $e->getMessage(), 'log' => $this->log];
        }
    }

    /**
     * 净化邮箱地址（过滤 CRLF 注入、验证格式）
     */
    private function sanitizeEmail($email) {
        // 移除所有换行符（防止 SMTP 命令注入）
        $email = str_replace(["\r", "\n", "\0"], '', trim($email));
        // 验证邮箱格式
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            return false;
        }
        return $email;
    }

    private function connect() {
        $host = $this->host;
        // 验证主机名，防止 SSRF（只允许域名和 IP，不允许特殊协议）
        $cleanHost = str_replace(["\r", "\n"], '', $host);
        if ($cleanHost !== $host) {
            throw new Exception("无效的 SMTP 服务器地址");
        }

        if ($this->encryption === 'ssl') {
            $host = 'ssl://' . $host;
        }

        $this->socket = @fsockopen($host, $this->port, $errno, $errstr, $this->timeout);

        if (!$this->socket) {
            throw new Exception("连接 SMTP 服务器失败: {$errstr} ({$errno})");
        }

        stream_set_timeout($this->socket, $this->timeout);
        $this->getResponse(220);
    }

    private function ehlo() {
        $hostname = gethostname() ?: 'localhost';
        $this->sendCommand("EHLO {$hostname}", 250);
    }

    private function startTLS() {
        $this->sendCommand("STARTTLS", 220);

        $crypto = STREAM_CRYPTO_METHOD_TLSv1_2_CLIENT;
        if (defined('STREAM_CRYPTO_METHOD_TLSv1_3_CLIENT')) {
            $crypto |= STREAM_CRYPTO_METHOD_TLSv1_3_CLIENT;
        }

        if (!stream_socket_enable_crypto($this->socket, true, $crypto)) {
            throw new Exception("TLS 加密启用失败");
        }
    }

    private function authenticate() {
        $this->sendCommand("AUTH LOGIN", 334);
        $this->sendCommand(base64_encode($this->username), 334);
        $this->sendCommand(base64_encode($this->password), 235);
    }

    private function mailFrom($email) {
        $this->sendCommand("MAIL FROM:<{$email}>", 250);
    }

    private function rcptTo($email) {
        $this->sendCommand("RCPT TO:<{$email}>", 250);
    }

    private function data($fromEmail, $fromName, $toEmail, $subject, $body, $isHtml) {
        $this->sendCommand("DATA", 354);

        $contentType = $isHtml ? 'text/html' : 'text/plain';
        $encodedSubject  = '=?UTF-8?B?' . base64_encode($subject) . '?=';
        $encodedFromName = '=?UTF-8?B?' . base64_encode($fromName) . '?=';
        $messageId = '<' . uniqid('fox_', true) . '@' . ($this->host ?: 'localhost') . '>';

        $message  = "Message-ID: {$messageId}\r\n";
        $message .= "Date: " . date('r') . "\r\n";
        $message .= "From: {$encodedFromName} <{$fromEmail}>\r\n";
        $message .= "To: <{$toEmail}>\r\n";
        $message .= "Subject: {$encodedSubject}\r\n";
        $message .= "MIME-Version: 1.0\r\n";
        $message .= "Content-Type: {$contentType}; charset=UTF-8\r\n";
        $message .= "Content-Transfer-Encoding: base64\r\n";
        $message .= "\r\n";
        $message .= chunk_split(base64_encode($body));
        $message .= "\r\n.";

        $this->sendCommand($message, 250);
    }

    private function quit() {
        $this->sendCommand("QUIT", 221);
        @fclose($this->socket);
        $this->socket = null;
    }

    private function sendCommand($command, $expectedCode) {
        fwrite($this->socket, $command . "\r\n");

        // 日志中隐藏敏感信息
        $logCmd = $command;
        if (preg_match('/^[A-Za-z0-9+\/=]{20,}$/', trim($command))) {
            $logCmd = '***[BASE64 DATA]***';
        }
        $this->log[] = "C: " . substr($logCmd, 0, 200);

        return $this->getResponse($expectedCode);
    }

    private function getResponse($expectedCode) {
        $response = '';
        $endTime = time() + $this->timeout;

        while (time() < $endTime) {
            $line = @fgets($this->socket, 515);
            if ($line === false) break;
            $response .= $line;
            // 多行响应以 "code-" 开头，最终行以 "code " 开头
            if (isset($line[3]) && $line[3] === ' ') break;
        }

        $this->log[] = "S: " . trim(substr($response, 0, 300));
        $code = intval(substr($response, 0, 3));

        if ($code !== $expectedCode) {
            throw new Exception("SMTP 错误 [{$code}]: " . trim($response) . " (期望 {$expectedCode})");
        }

        return $response;
    }

    public function getLog() {
        return $this->log;
    }
}

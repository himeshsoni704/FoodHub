<?php
include 'db.php';

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'POST') {
    $body = json_decode(file_get_contents('php://input'), true) ?? [];
    $nid  = (int)($body['notification_id'] ?? 0);
    $all  = $body['all'] ?? false;
    $uid  = (int)($body['user_id'] ?? 0);

    if ($all && $uid) {
        $conn->query("UPDATE notifications SET is_read=1 WHERE user_id=$uid");
    } elseif ($nid) {
        $conn->query("UPDATE notifications SET is_read=1 WHERE id=$nid");
    }
    echo json_encode(["status" => "success"]);
    exit;
}

if ($method !== 'GET') {
    echo json_encode(["error" => "Invalid method"]);
    exit;
}

$uid = (int)($_GET['user_id'] ?? 0);

if (!$uid) {
    echo json_encode([]);
    exit;
}

$res  = $conn->query(
    "SELECT id, user_id, message, is_read, created_at
     FROM notifications
     WHERE user_id=$uid
     ORDER BY created_at DESC
     LIMIT 30"
);
$data = [];
while ($r = $res->fetch_assoc()) {
    $data[] = [
        'id'         => (int)$r['id'],
        'text'       => $r['message'],       // JS expects 'text'
        'message'    => $r['message'],       // keep original too
        'is_read'    => (int)$r['is_read'],
        'time'       => $r['created_at'],    // JS expects 'time'
        'created_at' => $r['created_at'],
        'color'      => $r['is_read'] ? 'var(--muted)' : 'var(--orange)',
    ];
}

echo json_encode($data);

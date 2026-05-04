<?php
// ─── order.php ────────────────────────────────────────────────────────────────
include 'db.php';

ini_set('display_errors', 1);
error_reporting(E_ALL);

$body   = json_decode(file_get_contents('php://input'), true) ?? [];
$get    = $_GET;
$action = $body['action'] ?? $get['action'] ?? '';

// ── GET ───────────────────────────────────────────────────────────────────────
if ($_SERVER['REQUEST_METHOD'] === 'GET') {

    if ($action === 'customer_orders') {
        $uid = (int)($get['customer_id'] ?? 0);
        $res = $conn->query(
            "SELECT o.id, o.user_id, o.restaurant_id, o.total_amount,
                    o.status, o.created_at,
                    r.name AS rest_name,
                    GROUP_CONCAT(mi.name, ' x', oi.quantity SEPARATOR ', ') AS items
             FROM orders o
             LEFT JOIN restaurants r  ON r.id  = o.restaurant_id
             LEFT JOIN order_items oi ON oi.order_id = o.id
             LEFT JOIN menu_items  mi ON mi.id = oi.menu_item_id
             WHERE o.user_id=$uid
             GROUP BY o.id
             ORDER BY o.created_at DESC"
        );
        echo json_encode(buildOrderRows($res));
        exit;
    }

    if ($action === 'restaurant_orders') {
        $rid = (int)($get['rest_id'] ?? 0);
        $res = $conn->query(
            "SELECT o.id, o.user_id, o.restaurant_id, o.total_amount,
                    o.status, o.created_at,
                    u.name AS customer,
                    GROUP_CONCAT(mi.name, ' x', oi.quantity SEPARATOR ', ') AS items
             FROM orders o
             LEFT JOIN users        u  ON u.id  = o.user_id
             LEFT JOIN order_items oi  ON oi.order_id = o.id
             LEFT JOIN menu_items  mi  ON mi.id = oi.menu_item_id
             WHERE o.restaurant_id=$rid
             GROUP BY o.id
             ORDER BY o.created_at DESC"
        );
        echo json_encode(buildOrderRows($res));
        exit;
    }

    if ($action === 'all_orders') {
        // FIX: view_order_details now includes user_id + restaurant_id (schema fix)
        $res = $conn->query(
            "SELECT order_id AS id, user_id, restaurant_id,
                    customer, rest_name, items, amount AS total_amount,
                    status, created_at
             FROM view_order_details
             ORDER BY created_at DESC"
        );
        echo json_encode(buildOrderRows($res));
        exit;
    }

    if ($action === 'revenue_summary') {
        $rid   = (int)($get['rest_id'] ?? 0);
        $where = $rid ? "WHERE restaurant_id=$rid" : "";

        $totRes = $conn->query("
            SELECT
                COALESCE(SUM(total_amount), 0) AS total_revenue,
                COUNT(*)                        AS total_orders,
                SUM(status='DELIVERED')         AS delivered_orders
            FROM orders $where
        ");
        $totals = $totRes->fetch_assoc();

        $whereView = $rid ? "WHERE restaurant_id=$rid" : "";
        $restRes   = $conn->query("
            SELECT rest_name, total_orders AS order_count,
                   total_revenue, avg_rating, restaurant_id
            FROM view_restaurant_revenue
            $whereView
            ORDER BY total_revenue DESC
        ");
        $topRests = [];
        while ($row = $restRes->fetch_assoc()) $topRests[] = $row;

        echo json_encode(array_merge($totals, ['top_restaurants' => $topRests]));
        exit;
    }

    if ($action === 'get_ratings') {
        $rid   = (int)($_GET['rest_id'] ?? 0);
        $where = $rid ? "WHERE r.restaurant_id=$rid" : "";
        $res   = $conn->query("
            SELECT r.*, u.name AS customer_name, rest.name AS rest_name
            FROM ratings r
            JOIN users u          ON u.id    = r.customer_id
            JOIN restaurants rest ON rest.id = r.restaurant_id
            $where
            ORDER BY r.created_at DESC LIMIT 20
        ");
        $data = [];
        while ($row = $res->fetch_assoc()) $data[] = $row;
        echo json_encode($data);
        exit;
    }

    echo json_encode(["error" => "Unknown GET action"]);
    exit;
}

// ── POST ──────────────────────────────────────────────────────────────────────
if ($_SERVER['REQUEST_METHOD'] === 'POST') {

    // ── Place order ──────────────────────────────────────────────────────────
    if ($action === '' || $action === 'place') {
        $uid    = (int)($body['customer_id']   ?? 0);
        $restId = (int)($body['rest_id']        ?? 0);
        $total  = (float)($body['total_amount'] ?? 0);
        $items  = $body['items'] ?? [];

        if (!$uid || !$restId || empty($items)) {
            http_response_code(400);
            echo json_encode(["error" => "Missing required fields"]);
            exit;
        }

        $stmt = $conn->prepare(
            "INSERT INTO orders (user_id, restaurant_id, total_amount, status)
             VALUES (?, ?, ?, 'PLACED')"
        );
        $stmt->bind_param("iid", $uid, $restId, $total);

        if ($stmt->execute()) {
            $orderId = $conn->insert_id;

            foreach ($items as $it) {
                $itemId = (int)($it['id']      ?? 0);
                $qty    = (int)($it['qty']     ?? 1);
                $price  = (float)($it['price'] ?? 0);

                if ($itemId) {
                    $conn->query(
                        "INSERT INTO order_items (order_id, menu_item_id, quantity, price)
                         VALUES ($orderId, $itemId, $qty, $price)"
                    );
                    $conn->query(
                        "UPDATE menu_items SET stock = GREATEST(stock - $qty, 0) WHERE id=$itemId"
                    );
                }
            }

            // In-app notification
            $msg = $conn->real_escape_string("Order #$orderId placed successfully! Total: ₹$total");
            $conn->query("INSERT INTO notifications (user_id, message) VALUES ($uid, '$msg')");

            // Instagram DM (non-blocking)
            triggerInstagramNotif($uid, "Your FoodHub order #$orderId has been placed! 🍔 We'll keep you updated.");

            echo json_encode(["status" => "success", "order_id" => "ORD-$orderId"]);
        } else {
            echo json_encode(["error" => "Order creation failed: " . $conn->error]);
        }
        exit;
    }

    // ── Update order status ──────────────────────────────────────────────────
    if ($action === 'update_status') {
        $orderId = (int)str_replace('ORD-', '', ($body['order_id'] ?? '0'));
        $status  = $conn->real_escape_string($body['status'] ?? '');

        $statusLabel = [
            'CONFIRMED'        => 'confirmed ✅',
            'PREPARING'        => 'being prepared 👨‍🍳',
            'OUT_FOR_DELIVERY' => 'out for delivery 🛵',
            'DELIVERED'        => 'delivered — enjoy your meal! 🎉',
            'CANCELLED'        => 'cancelled ❌',
        ][$status] ?? $status;

        if ($conn->query("UPDATE orders SET status='$status' WHERE id=$orderId")) {
            $oRes = $conn->query("SELECT user_id FROM orders WHERE id=$orderId");
            $oRow = $oRes->fetch_assoc();

            if ($oRow) {
                $uid = (int)$oRow['user_id'];
                $msg = $conn->real_escape_string("Order #$orderId status: $status");
                $conn->query("INSERT INTO notifications (user_id, message) VALUES ($uid, '$msg')");
                triggerInstagramNotif($uid, "FoodHub Update 📦 Your order #$orderId is now $statusLabel");
            }
            echo json_encode(["status" => "ok"]);
        } else {
            echo json_encode(["error" => $conn->error]);
        }
        exit;
    }

    // ── Add rating ───────────────────────────────────────────────────────────
    if ($action === 'add_rating') {
        $uid     = (int)($body['customer_id'] ?? 0);
        $orderId = (int)str_replace('ORD-', '', ($body['order_id'] ?? '0'));
        $stars   = (int)($body['stars']       ?? 0);
        $comment = $conn->real_escape_string($body['comment'] ?? '');

        $oRes = $conn->query("SELECT restaurant_id FROM orders WHERE id=$orderId");
        $oRow = $oRes->fetch_assoc();
        $rid  = $oRow ? (int)$oRow['restaurant_id'] : 0;

        if ($uid && $rid && $stars) {
            $conn->query(
                "INSERT INTO ratings (customer_id, restaurant_id, order_id, stars, comment)
                 VALUES ($uid, $rid, $orderId, $stars, '$comment')
                 ON DUPLICATE KEY UPDATE stars=$stars, comment='$comment'"
            );
            $conn->query(
                "UPDATE restaurants
                 SET rating = (SELECT AVG(stars) FROM ratings WHERE restaurant_id=$rid)
                 WHERE id=$rid"
            );
            echo json_encode(["status" => "success"]);
        } else {
            echo json_encode(["error" => "Incomplete rating data"]);
        }
        exit;
    }

    echo json_encode(["error" => "Unknown POST action"]);
    exit;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function buildOrderRows($res) {
    $data = [];
    if (!$res) return $data;
    while ($r = $res->fetch_assoc()) {
        $data[] = [
            'id'            => 'ORD-' . $r['id'],
            'user_id'       => (int)$r['user_id'],
            'restaurant_id' => (int)$r['restaurant_id'],
            'rest_name'     => $r['rest_name']   ?? '',
            'customer'      => $r['customer']    ?? '',
            'items'         => $r['items']       ?? '',
            'amount'        => (float)$r['total_amount'],
            'status'        => $r['status'],
            'created_at'    => $r['created_at'],
        ];
    }
    return $data;
}

// ─────────────────────────────────────────────────────────────────────────────
// triggerInstagramNotif()
//
// FIX: Was hardcoded to /foodhub/php/api/ — now builds the URL dynamically
//      from the script's own path so it works in any subfolder name.
// ─────────────────────────────────────────────────────────────────────────────
function triggerInstagramNotif($user_id, $message) {
    // Build URL from the current script's location — works regardless of
    // what the project folder is named (foodhub, foodHUb, myapp, etc.)
    $selfDir = rtrim(dirname($_SERVER['SCRIPT_NAME'] ?? '/php/api/order.php'), '/');
    $url     = 'http://127.0.0.1' . $selfDir . '/send_instagram.php';

    $logfile = __DIR__ . '/instagram_debug.log';
    $payload = json_encode(['user_id' => (int)$user_id, 'message' => $message]);

    file_put_contents(
        $logfile,
        date('[Y-m-d H:i:s] ') . "triggerInstagramNotif → $url  payload=$payload\n",
        FILE_APPEND
    );

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => $payload,
        CURLOPT_HTTPHEADER     => ['Content-Type: application/json'],
        CURLOPT_TIMEOUT        => 2,
        CURLOPT_CONNECTTIMEOUT => 2,
        CURLOPT_NOSIGNAL       => 1,
    ]);

    $response = curl_exec($ch);
    $errno    = curl_errno($ch);
    curl_close($ch);

    $logLine = $errno
        ? "cURL error $errno contacting send_instagram.php\n"
        : "send_instagram response: $response\n";

    file_put_contents($logfile, date('[Y-m-d H:i:s] ') . $logLine, FILE_APPEND);
}
?>

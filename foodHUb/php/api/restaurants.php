<?php
// ─── restaurants.php ──────────────────────────────────────────────────────────
include 'db.php';

$body   = json_decode(file_get_contents('php://input'), true) ?? [];
$get    = $_GET;
$action = $body['action'] ?? $get['action'] ?? 'list';

// ── GET ───────────────────────────────────────────────────────────────────────
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    // FIX: if seller_id is passed, return only that seller's restaurants
    // This ensures S.sellerRestId is set to the correct restaurant
    $sellerId = (int)($get['seller_id'] ?? 0);
    echo json_encode(listRestaurants($conn, $sellerId));
    exit;
}

// ── POST (all write operations) ───────────────────────────────────────────────
if ($_SERVER['REQUEST_METHOD'] === 'POST') {

    if ($action === 'toggle_status') {
        $id     = (int)($body['id']     ?? 0);
        $active = (int)($body['active'] ?? 0);
        $conn->query("UPDATE restaurants SET is_active=$active WHERE id=$id");
        echo json_encode(["status" => "ok"]);
        exit;
    }

    if ($action === 'add_item') {
        $restId = (int)($body['rest_id'] ?? 0);
        $name   = $conn->real_escape_string($body['name']        ?? '');
        $cat    = $conn->real_escape_string($body['category']    ?? 'General');
        $desc   = $conn->real_escape_string($body['description'] ?? '');
        $price  = (float)($body['price'] ?? 0);
        $stock  = (int)($body['stock']   ?? 0);
        $conn->query(
            "INSERT INTO menu_items (restaurant_id, name, category, description, price, stock)
             VALUES ($restId, '$name', '$cat', '$desc', $price, $stock)"
        );
        echo json_encode(["status" => "ok", "id" => $conn->insert_id]);
        exit;
    }

    if ($action === 'update_item') {
        $id    = (int)($body['id']    ?? 0);
        $name  = $conn->real_escape_string($body['name']        ?? '');
        $cat   = $conn->real_escape_string($body['category']    ?? '');
        $desc  = $conn->real_escape_string($body['description'] ?? '');
        $price = (float)($body['price'] ?? 0);
        $stock = (int)($body['stock']   ?? 0);
        $conn->query(
            "UPDATE menu_items SET name='$name', category='$cat', description='$desc',
             price=$price, stock=$stock WHERE id=$id"
        );
        echo json_encode(["status" => "ok"]);
        exit;
    }

    if ($action === 'delete_item') {
        $id = (int)($body['id'] ?? 0);
        $conn->query("DELETE FROM menu_items WHERE id=$id");
        echo json_encode(["status" => "ok"]);
        exit;
    }

    if ($action === 'toggle_item') {
        $id  = (int)($body['id']        ?? 0);
        $val = (int)($body['available'] ?? 0);
        $conn->query("UPDATE menu_items SET available=$val WHERE id=$id");
        echo json_encode(["status" => "ok"]);
        exit;
    }

    echo json_encode(["error" => "Unknown action"]);
    exit;
}

echo json_encode(["error" => "Method not allowed"]);

// ── HELPER ────────────────────────────────────────────────────────────────────
function listRestaurants($conn, $sellerId = 0) {
    // FIX: if seller_id provided, only return that seller's restaurants
    //      This fixes the bug where S.sellerRestId always defaulted to restaurant 1
    $where = $sellerId ? "WHERE owner_id=$sellerId" : "";
    $res   = $conn->query("SELECT * FROM restaurants $where ORDER BY id ASC");
    $data  = [];
    while ($r = $res->fetch_assoc()) {
        $r['active'] = (int)$r['is_active'];
        $r['emoji']  = $r['emoji']  ?: '🍽️';
        $r['bg']     = $r['bg']     ?: 'var(--orange-bg)';
        $r['rating'] = $r['rating'] ?: '—';
        $r['time']   = '~30 min';
        $data[] = $r;
    }
    return $data;
}
?>

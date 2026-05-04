<?php
include 'db.php';

// Only GET needed — write operations go through restaurants.php
if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    echo json_encode(["error" => "GET only"]);
    exit;
}

$restId = (int)($_GET['rest_id'] ?? 0);

if (!$restId) {
    echo json_encode(["error" => "rest_id required"]);
    exit;
}

$res  = $conn->query(
    "SELECT * FROM menu_items WHERE restaurant_id=$restId ORDER BY category, name"
);
$data = [];
while ($r = $res->fetch_assoc()) {
    // Provide UI-friendly fallbacks for fields not in schema
    $r['emoji'] = $r['emoji'] ?: '🍽️';
    // Use the real 'available' DB column (seller-controlled). Fall back only if NULL.
    if (!isset($r['available']) || $r['available'] === null) {
        $r['available'] = $r['stock'] > 0 ? 1 : 0;
    } else {
        $r['available'] = (int)$r['available'];
    }
    // restaurant_id must be present so addToCart() can enforce single-restaurant cart
    $r['restaurant_id'] = (int)$r['restaurant_id'];
    $data[] = $r;
}

echo json_encode($data);

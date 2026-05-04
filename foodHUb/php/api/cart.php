<?php
// Cart is managed client-side in JavaScript (S.cart object).
// This endpoint is a no-op stub kept for API completeness.
// All cart data is sent directly to order.php on checkout.
include 'db.php';

echo json_encode(["status" => "ok", "message" => "Cart is managed client-side"]);
?>

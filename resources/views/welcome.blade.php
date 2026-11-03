<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    {{-- Lets phones use the mobile layout instead of a zoomed-out desktop page. --}}
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>GGG Inventory Management System</title>
    <link rel="icon" type="image/svg+xml" href="/favicon.svg">
    <meta name="csrf-token" content="{{ csrf_token() }}">

    <!-- System font: Plus Jakarta Sans (one font for every page; see --font-sans in src/styles/index.css) -->
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">

    <!-- Font Awesome Icons -->
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css" rel="stylesheet">

    @viteReactRefresh
    @vite(['src/styles/index.css', 'src/layouts/App.jsx'])
</head>
<body>
    <div id="root"></div>
</body>
</html>

FROM php:8.2-apache

# Install required system packages for Laravel and copy Composer directly from its official image
RUN apt-get update && apt-get install -y unzip libpng-dev libpng-dev \
    && docker-php-ext-install pdo pdo_mysql gd
COPY --from=composer:latest /usr/bin/composer /usr/bin/composer

WORKDIR /var/www/html
COPY . .

# Run composer installation smoothly
RUN composer install --no-dev --optimize-autoloader \
    && chown -R www-data:www-data storage bootstrap/cache \
    && sed -ri -e 's!/var/www/html!/var/www/html/public!g' /etc/apache2/sites-available/*.conf \
    && a2enmod rewrite

EXPOSE 80

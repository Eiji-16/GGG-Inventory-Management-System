FROM php:8.2-apache

RUN docker-php-ext-install pdo pdo_mysql \
    && curl -sS https://getcomposer.org | php -- --install-dir=/usr/local/bin --filename=composer

WORKDIR /var/www/html
COPY . .

RUN composer install --no-dev --optimize-autoloader \
    && chown -R www-data:www-data storage bootstrap/cache \
    && sed -ri -e 's!/var/www/html!/var/www/html/public!g' /etc/apache2/sites-available/*.conf \
    && a2enmod rewrite

EXPOSE 80

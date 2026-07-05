FROM php:8.3-apache

# Set up the working directory
WORKDIR /var/www/html

# Copy all your project files into the container
COPY . .

# Force Apache to serve the static index.html from Vite instead of booting up Laravel's index.php
RUN sed -ri -e 's!/var/www/html!/var/www/html/public!g' /etc/apache2/sites-available/*.conf \
    && a2enmod rewrite \
    && cp /var/www/html/public/index.html /var/www/html/public/index.php || true

EXPOSE 80

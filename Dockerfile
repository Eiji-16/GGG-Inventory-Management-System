FROM php:8.3-apache

# Install required system tools for compiling backend packages
RUN apt-get update && apt-get install -y unzip libpng-dev \
    && docker-php-ext-install pdo pdo_mysql gd

# Copy the official composer binary directly into system binaries
COPY --from=composer:latest /usr/bin/composer /usr/bin/composer

# Set up the working directory inside the container
WORKDIR /var/www/html

# Copy all your project files into that folder
COPY . .

# Run composer installation and update Apache root paths smoothly
RUN composer install --no-dev --optimize-autoloader \
    && chown -R www-data:www-data storage bootstrap/cache \
    && sed -ri -e 's!/var/www/html!/var/www/html/public!g' /etc/apache2/sites-available/*.conf \
    && a2enmod rewrite

EXPOSE 80

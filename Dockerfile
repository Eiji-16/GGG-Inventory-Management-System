FROM php:8.2-apache
RUN docker-php-ext-install pdo pdo_mysql

# Install Composer globally into system binaries
RUN curl -sS https://getcomposer.org | php -- --install-dir=/usr/local/bin --filename=composer

COPY . /var/web
WORKDIR /var/web

# Run composer normally
RUN composer install --no-dev --optimize-autoloader
RUN chown -R www-data:www-data /var/web/storage /var/web/bootstrap/cache
RUN sed -ri -e 's!/var/www/html!/var/web/public!g' /etc/apache2/sites-available/*.conf
RUN a2enmod rewrite

EXPOSE 80

FROM php:8.3-apache

# Set up the public directory context
WORKDIR /var/www/html

# Copy all your project files into the container
COPY . .

# Bypass Laravel completely: Point Apache straight to the compiled React index file
RUN sed -ri -e 's!/var/www/html!/var/www/html/public!g' /etc/apache2/sites-available/*.conf \
    && a2enmod rewrite \
    && cp /var/www/html/public/index.php /var/www/html/public/index.html || true

EXPOSE 80

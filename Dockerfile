# Step 1: Build the frontend assets using Node
FROM node:18 AS frontend-builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Step 2: Set up the PHP Apache backend environment
FROM php:8.2-apache
RUN docker-php-ext-install pdo pdo_mysql
RUN curl -sS https://getcomposer.org | php -- --install-dir=/usr/local/bin --filename=composer

COPY . /var/web
WORKDIR /var/web

# Copy the compiled React assets over from Step 1
COPY --from=frontend-builder /app/public/build /var/web/public/build

RUN composer install --no-dev --optimize-autoloader
RUN chown -R www-data:www-data /var/web/storage /var/web/bootstrap/cache
RUN sed -ri -e 's!/var/www/html!/var/web/public!g' /etc/apache2/sites-available/*.conf
RUN a2enmod rewrite

EXPOSE 80

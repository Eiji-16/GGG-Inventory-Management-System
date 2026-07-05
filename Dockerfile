FROM php:8.2-apache
RUN docker-php-ext-install pdo pdo_mysql

# Download Composer into the local folder
RUN curl -sS https://getcomposer.org | php

COPY . /var/web
WORKDIR /var/web

# Run composer directly using php composer.phar
RUN php /var/web/composer.phar install --no-dev --optimize-autoloader
RUN chown -R www-data:www-data /var/web/storage /var/web/bootstrap/cache
RUN sed -ri -e 's!/var/www/html!/var/web/public!g' /etc/apache2/sites-available/*.conf
RUN a2enmod rewrite

EXPOSE 80

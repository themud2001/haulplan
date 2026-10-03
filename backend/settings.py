import os
SECRET_KEY = os.environ.get('DJANGO_SECRET_KEY', 'stateless-assessment-no-auth-or-sessions')
DEBUG = os.environ.get('DJANGO_DEBUG', 'false').lower() == 'true'
ALLOWED_HOSTS = ['.vercel.app', 'localhost', '127.0.0.1', 'testserver']
ROOT_URLCONF = 'backend.urls'
INSTALLED_APPS = []
MIDDLEWARE = ['django.middleware.security.SecurityMiddleware', 'django.middleware.common.CommonMiddleware']
APPEND_SLASH = False
USE_TZ = False
DATA_UPLOAD_MAX_MEMORY_SIZE = 32768
CACHES = {'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache', 'LOCATION': 'haulplan'}}
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = 'DENY'

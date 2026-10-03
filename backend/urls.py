from django.urls import path
from . import views
urlpatterns = [
    path('api/health', views.health),
    path('api/geocode', views.geocode),
    path('api/reverse-geocode', views.reverse_geocode),
    path('api/plan', views.plan),
]

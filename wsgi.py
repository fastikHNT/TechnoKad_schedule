# -*- coding: utf-8 -*-
import os, sys

# путь к проекту
sys.path.append('/home/t/techn2tech/public_html')
# путь к виртуальному окружению
sys.path.append('/home/t/techn2tech/.flaskvenv/lib/python3.11/site-packages/')
# исключить системную директорию
sys.path.remove('/usr/lib/python3.11/site-packages')

from app import app
application = app

### Step 1: Thiết lập Database và Project

```
sudo service postgresql start
sqlalchemy.url = postgresql://devworkspaceuser:123456abcA@localhost:5432/devworkspacedb
$ sudo su postgres
$ psql
postgres=# create database devworkspacedb encoding='UTF-8';
CREATE DATABASE
postgres=# create user devworkspaceuser with password '123456abcA';
CREATE ROLE
postgres=# grant all privileges on database devworkspacedb to devworkspaceuser;
GRANT
postgres=#

# \q
```

## Step2. Install needed packages

- Aptitude tool: For higher performance and more active than apt-get

```
$ sudo apt-get update
$ sudo apt-get install aptitude
```

- Python3.8/3.9 and python virtual environment

```
$ sudo aptitude install python3.8
$ sudo aptitude install python3.8-venv
```

- Postgresql version 9 or later

```
$ sudo aptitude install postgresql
```

- Python3.8-dev / python3.9-dev

```
$ aptitude install python3.8-dev
```

- Git (Source code management tool)

```
$ aptitude install git
```

## Step 3: Copy Skeleton Project

```
$ python3.8 -m venv eye_clinic
$ cd eye_clinic
$ git clone https://gitlab.com/healthcaresevencent/eye_clinic.git repo
$ cd repo
```

## Step 4: Install extensions.

```
$ source ../bin/activate
$ sudo apt-get install libkrb5-dev -y
$ pip install -r requirements.txt
$ sudo apt-get install gcc libpq-dev -y
$ sudo apt-get install python-dev python-pip -y
$ sudo apt-get install python3-dev python3-pip python3-venv python3-wheel -y
$ pip3 install wheel
```

## Step 5: Run test web server

```
$ python manage.py run
[2019-12-08 19:33:10 +0700] [41926] [INFO] Goin' Fast @ http://0.0.0.0:8000
[2019-12-08 19:33:10 +0700] [41929] [INFO] Starting worker [41929]
[2019-12-08 19:33:10 +0700] [41930] [INFO] Starting worker [41930]
```

## Step 6: Fix bug(header postgresql)

```
sudo apt-get install libpq-dev
pip install psycopg2-binary
```

## Step 7: Migrate Test Model to Database

```
$ pip install psycopg2-binary
$ rm -Rf alembic/versions/
$ mkdir alembic/versions/

--- migrate form models to database
$ alembic revision --autogenerate -m "init"
INFO [alembic.runtime.migration] Context impl PostgresqlImpl.
INFO [alembic.runtime.migration] Will assume transactional DDL.
Generating /mnt/share/Documents/Projects/Python3/gonstack/gatco_basic_application/alembic/versions/56302fe4c0f7_init.py ... done

$ alembic upgrade head

INFO [alembic.runtime.migration] Context impl PostgresqlImpl.
INFO [alembic.runtime.migration] Will assume transactional DDL.
INFO [alembic.runtime.migration] Running upgrade -> 56302fe4c0f7, init
```

#####

pull Vendor library

```
$ cd static
$ git clone https://github.com/gonrin/GonrinJS.git lib
$ cd ../vendors/
$ git clone https://github.com/vietanh294/GonrinUI.git
$ git clone https://github.com/vietanh294/GonrinUIBoostrap4
$ cd ../../
Create login View
Generate JS Schema
$ python manage.py generate_schema
$ python manage.py init_role_user
$ python manage.py import_danhmuc
$ python manage.py generate_constant_file

```

--DONE-----------------------
----------------add-on-----------------
----install POSTGRESQL

```
sudo apt update
sudo apt upgrade
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql.service
---
$virtualenv
$sudo apt update
$sudo apt upgrade
$sudo apt install python3.9
$sudo apt-get install python3.9-dev python3.9-venv
$sudo add-apt-repository ppa:deadsnakes/ppa
$sudo apt-get update
$sudo apt-get install python3.9
sudo apt install default-jre
$sudo update-alternatives --install /usr/bin/python3 python3 /usr/bin/python3.9 1
$sudo update-alternatives --install /usr/bin/python3 python3 /usr/bin/python3.9 2
$sudo update-alternatives --config python3

$sudo apt-get install python3.9-dev python3.9-venv
Now I create a virtual environment using

## $python3.9 -m venv dl4cv

## sudo chown -R ubuntu:ubuntu /opt/deploy

Rename but can not alembic
ALTER TABLE table_name RENAME COLUMN old_name TO new_name;
ALTER TABLE oganization RENAME TO organization;
ALTER DATABASE "old_dbname" RENAME TO "new_dbname";
-----user--Postgres
DROP OWNED BY your_user;
DROP USER your_user;
sudo chown -R minio:minio /data/minio
psql -h 127.0.0.1 -U canteenusr canteendb< icanteen_dump2022.sql
```

select column_name, data_type from information_schema.columns where table_name = 'ct_dinh_duong';
sudo apt install libcairo2-dev pkg-config python3-dev
pip3 install pycairo

```

```


set -o allexport; source ./env/devenv; set +o allexport
from application.database import redisdb, db
from application.server import app
# Libraries
# import sys
# import json
import random
import string
import uuid
# import os
import re
import ujson
import binascii
# from application.models.model import User, Role
from sqlalchemy import or_, and_
from slugify import slugify
from gatco.response import json
from application.extensions import auth
from application.services.auth_service import current_user as current_jwt_user

def auth_func(request=None, **kw):
    current_user = get_current_user(request)
    if current_user is None:
        return json({
            "error_code": 'SESSION_EXPIRED',
            "error_message": "Phiên làm việc hết hạn"
        }, status=520)
    
    
async def deny_request(request=None, data=None, Model=None, **kw):
    return json({'error_code': 'DENY_REQUEST', 'error_message': 'request not found'}, status=401)

def get_tenant_id(request):
    tenant_id = request['session'].get('current_tenant_id', None)
    print("get_tenant_id", tenant_id)
    if tenant_id is None:
        current_user = get_current_user(request)
        if (current_user is not None) and (current_user.get("current_tenant_id") is not None):
            tenant_id = current_user.get("current_tenant_id")
            request['session']['current_tenant_id'] = tenant_id
    return tenant_id

def get_current_user(request, **kw):
    jwt_user = current_jwt_user(request)
    if jwt_user is not None:
        return jwt_user

    user_token = request.headers.get("X-USER-TOKEN")
    if user_token is not None and redisdb is not None:
        session_key = "sessions:" + user_token
        userobj = redisdb.get(session_key)
        if userobj is not None:
            return ujson.loads(userobj.decode("utf-8"))
    
    current_user = auth.current_user(request)
    if current_user is None:
        account_url = app.config.get("ACCOUNT_URL")
        if account_url:
            url = account_url + "/current_user"
            headers = {}
            if "Cookie" in request.headers:
                headers["Cookie"] = request.headers["Cookie"]
            if "Authorization" in request.headers:
                headers["Authorization"] = request.headers["Authorization"]
            if "X-USER-TOKEN" in request.headers:
                headers["X-USER-TOKEN"] = request.headers["X-USER-TOKEN"]
            try:
                import requests
                resp = requests.get(url, headers=headers, timeout=5, verify=False)
                if resp.status_code == 200:
                    current_user = resp.json()
            except Exception as e:
                print("Failed to fetch user from account service:", e)
    return current_user
    

def add_tenant_id(request=None, data=None, Model=None, **kw):
    tenant_id = get_tenant_id(request)
    if (tenant_id is not None):
        data['tenant_id'] = tenant_id
    else:
        current_user = get_current_user(request)
        if (current_user is not None) and (current_user.get("current_tenant_id") is not None):
            data['tenant_id'] = current_user.get("current_tenant_id")
        else:
            return json({"error_code": "PERMISSION_DENIED", "error_message": "Unknown tenant"}, status=520)


def filter_tenant_id(request=None, search_params=None, Model=None, **kw):
    tenant_id = get_tenant_id(request)
    print("filter_tenant_id", tenant_id)
    if tenant_id is None:
        return json({"error_code": "PERMISSION_DENIED", "error_message": "Unknown tenant"}, status=520)
    if not "filters" in search_params:
        search_params["filters"] = {}
    if not "$and" in search_params["filters"]:
        search_params["filters"]["$and"] = []
    search_params["filters"]["$and"].append({"tenant_id": {"$eq": tenant_id}})

    print("search_params", search_params, tenant_id)
    
# async def set_to_cache(key,value,expire_time):
#     p = redisdb.pipeline()
#     p.set(key,value)
#     p.expire(key,expire_time)
#     p.execute()
#     return True

async def postprocess_gen_stt(request=None, Model=None, result=None, **kw):
    if "num_results" in result and (result["num_results"]> 0):
        results_per_page = int(request.args.get("results_per_page"))
        page = int(result['page'])
        stt = (page-1) * results_per_page
        for obj in result['objects']:
            stt = stt + 1
            obj["stt"] = stt

# def get_system_setting(keys=[]):
#     if keys is None or type(keys) != list or keys == []:
#         return None
    
#     system_setting_obj = {}
#     system_settings = db.session.query(Setting).filter(Setting.key.in_(keys)).all()
#     if system_settings is None:
#         return None
#     for item in system_settings:
#         system_setting_obj[item.key] = item.value

#     return system_setting_obj


# def generator_salt():
#     data = ''.join(random.choice(string.ascii_lowercase + string.digits) for _ in range(24))
#     return data

# def default_uuid():
#     return str(uuid.uuid4())

# def validate_email(email):
#     return re.match('^[_a-z0-9-]+(\.[_a-z0-9-]+)*@[a-z0-9-]+(\.[a-z0-9-]+)*(\.[a-z]{2,4})$', email)

# def validate_phone(phone):
#     return re.match('^(09|08|07|05|03|02)+[0-9]{8}$', phone)

# def validate_user(request, **kw):
#     uid = current_uid(request)
#     if uid is None:
#         return json({'error_code':'SESSION_EXPIRED', 'error_message':'Session Expired!'}, status=403)

# def deny_request(request, **kw):
#     return json({'error_code':'REQUEST_DENIED', 'error_message':'Request denied!'}, status=403)

# def current_uid(request):
#     user_token = request.headers.get("TOKEN-R-USER",None)
#     if user_token is None:
#         user_token = request.args.get("user_token",None)

#     if user_token is None:
#         cookie = request.headers.get("Cookie",None).split("; ")
#         for i in cookie:
#             check_token = i.split("=")
#             if (user_token is None) and 'TOKEN-R-USER' in check_token:
#                 user_token = check_token[1]

#     if user_token is None:
#         return None
    
#     uid = redisdb.get("sessions:" + user_token)
#     if uid is not None:
#         p = redisdb.pipeline()
#         p.set("sessions:" + user_token,uid)
#         p.expire("sessions:" + user_token,app.config.get("SESSION_EXPIRED",86400))
#         p.execute()
#         return uid.decode("utf-8")
#     return None

# def current_openapi_id(request):
#     user_token = request.headers.get("X-APP-TOKEN",None)
#     if user_token is None:
#         return None
#     uid = redisdb.get("openapi-sessions:" + user_token)
#     if uid is not None:
#         return uid.decode("utf-8")
#     return None

# def check_role (uuid, role):
#     ret_val = False
#     if uuid is None or role is None:
#         return False
#     uuid = str(uuid)
#     roles = None
#     roles_str = None
#     roles_str = redisdb.get("user-roles:" + uuid)
        
#     if roles_str is not None:
#         p = redisdb.pipeline()
#         p.set("user-roles:" + uuid, roles_str)
#         p.expire("user-roles:" + uuid, 1200)
#         p.execute()
#         roles_str = roles_str.decode("utf-8")
#         roles = ujson.loads(roles_str)
#     else:
#         user = db.session.query(User).filter(User.id == uuid).first()
#         if len(user.roles) > 0:
#             roles = []
#             for role_ in user.roles:
#                 roles.append(str(role_.name))
#             # roles = role_lst
#             roles_str = ujson.dumps(roles)
#             p = redisdb.pipeline()
#             p.set("user-roles:" + uuid, roles_str)
#             p.expire("user-roles:" + uuid, 1200)
#             p.execute()
#     if roles is not None:
#         if role in roles:
#             ret_val = True
#     print("check role admin ",ret_val)
#     return ret_val

# def check_role_or (uuid, role_lst):
#     ret_val = False
#     if uuid is None or role_lst is None or type(role_lst) != list or role_lst == []:
#         return False
#     uuid = str(uuid)
#     roles = None
#     roles_str = None
#     roles_str = redisdb.get("user-roles:" + uuid)  
#     if roles_str is not None:
#         p = redisdb.pipeline()
#         p.set("user-roles:" + uuid, roles_str)
#         p.expire("user-roles:" + uuid, 1200)
#         p.execute()
#         roles_str = roles_str.decode("utf-8")
#         roles = ujson.loads(roles_str)
#     else:
#         user = db.session.query(User).filter(User.id == uuid).first()
#         if len(user.roles) > 0:
#             roles = []
#             for role_ in user.roles:
#                 roles.append(str(role_.name))
#             roles_str = ujson.dumps(roles)
#             p = redisdb.pipeline()
#             p.set("user-roles:" + uuid, roles_str)
#             p.expire("user-roles:" + uuid, 1200)
#             p.execute()
#     if roles is not None:
#         for role in roles:
#             if role in role_lst:
#                 ret_val = True   
#     return ret_val


# def current_user(request):
#     user_token = request.headers.get("TOKEN-R-USER", None)
#     if user_token is None:
#         return None
#     uid = redisdb.get("sessions:" + user_token)
#     if uid is not None:
#         p = redisdb.pipeline()
#         p.set("sessions:" + user_token, uid)
#         p.expire("sessions:" + user_token, app.config.get('SESSION_EXPIRED', 86400))
#         p.execute()
#         currentUser = db.session.query(User).filter(and_(User.id == uid.decode('utf8'),User.deleted == False)).first()
#         if (currentUser is not None):
#             return currentUser
#     return None 

# # def generate_user_token(uid):
# #     token = binascii.hexlify(uuid.uuid4().bytes).decode
# #     p = redisdb.pipeline()
# #     p.set("session:"+token,uid)
# #     p.expire("session:"+token,app.config.get("SESSION_EXPIRE_TIME",86400))
# #     p.execute()
# #     return token

# def generate_user_token(uid_user=None, token =None, expire_time=None):
#     if token is None or token == "":
#         token =  binascii.hexlify(uuid.uuid4().bytes).decode()
#     if not isinstance(uid_user, str):
#         uid_user = str(uid_user)
#     p1 = redisdb.pipeline()
#     p1.set("sessions:" + token, uid_user)
#     print("sessions:==============================" ,token)
#     if expire_time is None:
#         expire_time = app.config.get('SESSION_EXPIRE_TIME', 86400)
#     p1.expire("sessions:" + token, expire_time)
#     p1.execute()
#     return token


# async def get_current_user(request, userId):
#     if userId is not None:
#         user = db.session.query(User).filter(User.active==True).filter(or_(User.id ==userId,User.phone == userId, User.email == userId)).first()
#         if user is None:
#             return None
#         user_token = request.headers.get("TOKEN-R-USER", None)
#         return response_current_user(user, user_token)
#     return None

# def response_current_user(user, token=None):
#     id = user.id
#     token = generate_user_token(id, token)
#     response = to_dict(user)
#     response.pop('password', None)
#     response.pop('salt', None)
#     response.pop('created_by', None)
#     response.pop('deleted', None)
#     response.pop('deleted_at', None)
#     response.pop('deleted_by', None)
#     response.pop('name_for_search', None)
#     # response.pop('confirmed_at', None)
#     # response.pop('type_confirm', None)

#     response['token'] = token
#     roles = []
#     if user.roles is not None:
#         for role in user.roles:
#             roles.append(role.name)
#     response["roles"] = roles
#     return response


# def check_content_json(request):
#     ret = False
#     try:
#         content_type = request.headers.get('Content-Type', "")
#         ret = content_type.startswith('application/json')
#     except:
#         pass
#     return ret


# def valid_phone_number(phone_number):
#     if phone_number is None:
#         return False
#     if phone_number.isdigit() and len(phone_number)>=8 and len(phone_number)<=12 and phone_number.startswith("0"):
#         return True
#     return False

def convert_text_for_search(text):
    if text is None:
        return None
    data_slugify = slugify(text.lower(), separator=" ")
    data_slugify = data_slugify.strip()
    return data_slugify

def gen_name_for_search(request=None, data=None, Model=None, **kw):
    if 'name' in data and data['name'] is not None:
        data['name_for_search'] = convert_text_for_search(data['name'])
    if 'title' in data and data['title'] is not None:
        data['title_for_search'] = convert_text_for_search(data['title'])
    if 'caption' in data and data['caption'] is not None:
        data['caption_for_search'] = convert_text_for_search(data['caption'])

skip_properties = ["id","created_at", "updated_at", "deleted", "deleted_at"]
def data_validation(request=None,data =None, **kw):
    for key in data:
        if key in skip_properties: 
            continue
        if data[key] is None:
            continue
        if type(data[key]) == string:
            # print("go on data:" ,data[key])
            data[key] = data[key].replace("<", "&lt;").replace(">", "&gt;")
        elif type(data[key]) == str:
            # print("go on data:" ,data[key])
            data[key] = data[key].replace("<", "&lt;").replace(">", "&gt;")
        

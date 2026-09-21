import time
from application.models.models import *
# from gatco_apimanager.views.sqlalchemy.helpers import to_dict
from gatco_apimanager.views.sqlalchemy.helpers import to_dict
from application.extensions import apimanager
from application.extensions import auth
from application.controllers.helpers.helper_common import (
    data_validation,
    gen_name_for_search,
    postprocess_gen_stt,
    get_tenant_id,
    get_current_user,
    outbound_request_options,
)
from application.services.pagination import PaginationError, bounded_int
from slugify import slugify
from gatco.response import json, text, html
from application.server import app
import unidecode
import requests


@auth.user_loader
def user_loader(token):
    if token is not None:
        if 'exprire' in token:
            if token['exprire'] < time.time():
                return None
            del(token["exprire"])
        return token
    return None

@app.route('/user/logout')
@app.route('/logout')
async def logout(request):
    try:
        # current_user = get_current_user(request)
        current_user = auth.current_user(request)
        if current_user is not None:
            user_id = current_user.get('id')
        auth.logout_user(request)
        request['session']['current_tenant_id'] = None
    except:
        pass
    return json({})


# @app.route('/user/login', methods=["GET", "POST"])
# async def user_login(request):
#     if request.method == "POST":
#         param = request.json
#         user_name = param.get("username")
#         password = param.get("password")
#         param["method"] = "access_token"
#         param["expire"] = 60*60*24*365

#         if (user_name is None) or (password is None):
#             return json({
#                     "error_code": 'PARAM_ERROR',
#                     "error_message": "Tham so khong hop le!"
#                 }, status=520)
#         url = app.config.get("ACCOUNT_URL") + "/login"
#         try: 
#             response = requests.post(url=url, json=param)
#             respdata = response.json()
#             if "error_code" in respdata:
#                 return json(respdata, status=520)
#             return json(respdata)
#         except:
#             return json({
#                 "error_code": "ERROR",
#                 "error_message": "error"
#             }, status=520)
    
#     # if request.method == "GET":
#     #     current_user = get_current_user(request)
#     #     print("current_user1", current_user.get("current_tenant_id"))
#     #     if current_user is None:
#     #         return json({
#     #             "error_code": 'SESSION_EXPIRED',
#     #             "error_message": "Phiên làm việc hết hạn"
#     #         }, status=520)
#     #     current_tenant_id = get_tenant_id(request)
#     #     print("current_user", current_tenant_id)
#     #     # print("current_user", current_tenant_id, current_user)
#     #     if current_tenant_id is None:
#     #         return json({
#     #             "error_code": 'SESSION_EXPIRED',
#     #             "error_message": "Phiên làm việc hết hạn"
#     #         }, status=520)
        
#     #     # print("current_tenant_id", current_tenant_id)

#     #     current_user["current_tenant_id"] = current_tenant_id
#     #     current_user["current_tenant_role"] = None
#     #     tenants = current_user.get("tenants")
#     #     if (current_user["current_tenant_id"] is not None) and (len(tenants) > 0):
#     #         for tnt in tenants:
#     #             if tnt.get("id") == current_user.get("current_tenant_id"):
#     #                 current_user["current_tenant_role"] = tnt.get("role")
#     #                 current_user["current_tenant"] = tnt
#     #                 break
#     #     try:
#     #         del current_user["current_tenant_require_init"]
#     #     except:
#     #         pass
#     #     tnt_setting = Tenant.query.filter(Tenant.tenant_id == current_tenant_id).first()

#     #     if (tnt_setting is None) or (tnt_setting.active is False):
#     #         if current_user["current_tenant_role"] == "admin":
#     #             current_user["current_tenant_require_init"] = True
#     #         else:
#     #             return json({
#     #                 "error_code": 'PARAM_ERROR',
#     #                 "error_message": "Doanh nghiệp chưa khởi tạo sử dụng dịch vụ này. Xin liên hệ với quản lý Doanh nghiệp để thêm thông tin chi tiết!"
#     #             }, status=520)

    
#     #     return json(current_user)



# def seed_default_org_user(request=None, **kw):
#     current_user = get_current_user(request)
#     tenant_id  = get_tenant_id(request)
#     if current_user is None or tenant_id is None:
#         return json({"error_code": "PERMISSION_DENIED"}, status=401)

#     process = ReviewProcess.query.filter(
#         ReviewProcess.tenant_id == tenant_id,
#         ReviewProcess.code == "LC_ISSUE"
#     ).first()

@app.route('/user/current_user')
@app.route('/current_user')
async def get_current_user_api(request):

    current_user = get_current_user(request)
    if current_user is None:
        return json({
            "error_code": 'SESSION_EXPIRED',
            "error_message": "Phiên làm việc hết hạn"
        }, status=520)

    current_tenant_id = get_tenant_id(request)
    print("current_user", current_tenant_id)
    # print("current_user", current_tenant_id, current_user)
    if current_tenant_id is None:
        return json({
            "error_code": 'SESSION_EXPIRED',
            "error_message": "Phiên làm việc hết hạn"
        }, status=520)
    
    # print("current_tenant_id", current_tenant_id)

    current_user["current_tenant_id"] = current_tenant_id
    current_user["current_tenant_role"] = None
    tenants = current_user.get("tenants") or []
    if (current_user["current_tenant_id"] is not None) and (len(tenants) > 0):
        for tnt in tenants:
            if tnt.get("id") == current_user.get("current_tenant_id"):
                current_user["current_tenant_role"] = tnt.get("role")
                current_user["current_tenant"] = tnt
                break
    try:
        del current_user["current_tenant_require_init"]
    except:
        pass

    user_org = UserOrganization.query.filter(UserOrganization.user_id == current_user.get("id")).first()
    # bd810f5b-840a-4d5c-b5da-e279ad0b3faf
    #TODO: remove 
    # if user_org is None:



    if user_org is not None:
        org = OrganizationUnit.query.filter(OrganizationUnit.id == user_org.organization_id).first()
        user_org_obj = to_dict(user_org)

        user_org_obj["code"] = org.code if org is not None else None
        user_org_obj["name"] = org.name if org is not None else None
        user_org_obj["unit_type"] = org.unit_type if org is not None else None
        user_org_obj["path"] = org.path if org is not None else None
        user_org_obj["is_active"] = org.is_active if org is not None else None

        current_user["organization"] = user_org_obj
    else:
        current_user["organization"] = None

    # tnt_setting = Tenant.query.filter(Tenant.tenant_id == current_tenant_id).first()

    # if (tnt_setting is None) or (tnt_setting.active is False):
    #     if current_user["current_tenant_role"] == "admin":
    #         current_user["current_tenant_require_init"] = True
    #     else:
    #         return json({
    #             "error_code": 'PARAM_ERROR',
    #             "error_message": "Doanh nghiệp chưa khởi tạo sử dụng dịch vụ này. Xin liên hệ với quản lý Doanh nghiệp để thêm thông tin chi tiết!"
    #         }, status=520)

    return json(current_user)
    




@app.route('/api/v1/user')
async def list_user(request):
    current_user = get_current_user(request)
    if current_user is None:
        return json({
            "error_code": 'SESSION_EXPIRED',
            "error_message": "Phiên làm việc hết hạn"
        }, status=520)
    
    current_tenant_id = get_tenant_id(request)
    if (current_tenant_id is None):
        return json({
            "error_code": 'SESSION_EXPIRED',
            "error_message": "Không hợp lệ"
        }, status=520)
    
    url = app.config.get("ACCOUNT_URL") + "/api/v1/user/get_scoped_users"
    
    headers = {
        "access-token": app.config.get("INTERNAL_ACCESS_TOKEN")
    }
    try:
        page = bounded_int(
            request.args.get("page"),
            name="page",
            default=1,
            minimum=1,
            maximum=100000,
        )
        results_per_page = bounded_int(
            request.args.get("results_per_page"),
            name="results_per_page",
            default=20,
            minimum=1,
            maximum=100,
        )
    except PaginationError as error:
        return json({"error_code": "PARAM_ERROR", "error_message": str(error)}, status=400)
    
    params = {
        "page": int(page),
        "results_per_page": int(results_per_page),
        "tid": current_tenant_id
    }
    resp = requests.get(
        url,
        params=params,
        headers=headers,
        **outbound_request_options("ACCOUNT_SSO_TIMEOUT", 10),
    )
    if resp.status_code == 200:
        data = resp.json()
        return json({
            "objects": data
        })
    try:
        return json(resp.json(), status=resp.status_code)
    except Exception:
        return json({
            "error_code": "ACCOUNT_SERVICE_INVALID_RESPONSE",
            "error_message": "The account service returned an invalid response.",
        }, status=502)

@app.route('/api/v1/user_info/<user_id>', methods=['GET'])
async def get_user_info_by_id(request, user_id):
    current_user = get_current_user(request)
    if current_user is None:
        return json({"error_code": "SESSION_EXPIRED"}, status=401)
    
    # Check if we can find in local db first
    user = User.query.filter(User.id == user_id).first() if user_id.isdigit() else User.query.filter(User.user_name == user_id).first()
    if user:
        return json(to_dict(user))

    # fallback to account API if not found
    url = app.config.get("ACCOUNT_URL") + "/api/v1/user/get_scoped_users"
    headers = {"access-token": app.config.get("INTERNAL_ACCESS_TOKEN")}
    params = {"tid": get_tenant_id(request), "results_per_page": 1000}
    try:
        resp = requests.get(
            url,
            params=params,
            headers=headers,
            **outbound_request_options("ACCOUNT_SSO_TIMEOUT", 10),
        )
        if resp.status_code == 200:
            users = resp.json()
            for u in users:
                if str(u.get("id")) == user_id or u.get("user_name") == user_id:
                    return json(u)
    except Exception:
        pass

    return json({"error_code": "NOT_FOUND"}, status=404)


@app.route('/tenant/set_current_tenant', methods=['POST'])
async def set_current_tenant(request):
    current_user = get_current_user(request)
    if current_user is None:
        return json({
            "error_code": 'SESSION_EXPIRED',
            "error_message": "Phiên làm việc hết hạn"
        }, status=520)

    body_data = request.json

    tenant_id = body_data.get('tenant_id', None)
    if tenant_id is None:
        return json({
            'error_code': 'DATA_ERROR',
            'error_message': 'Dữ liệu không hợp lệ'
        }, status=520)

    request['session']['current_tenant_id'] = tenant_id

    return json({}, status=200)

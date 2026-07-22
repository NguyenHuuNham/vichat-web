import os
import re
import mimetypes
import hashlib
import requests
from pathlib import Path
import time
from math import floor
from application.models.models import OrganizationUnit, UserOrganization
from gatco_apimanager.views.sqlalchemy.helpers import to_dict
from application.extensions import apimanager
from application.controllers.helpers.helper_common import (auth_func, deny_request,get_current_user, get_tenant_id,
        gen_name_for_search,add_tenant_id,postprocess_gen_stt,
        filter_tenant_id)

from slugify import slugify
import aiofiles
from gatco.response import json, text, html
from application.server import app
from application.database import db,redisdb
from application.extensions import minioclient

from abc import ABC, abstractmethod

def get_users(tenant_id):
    url = app.config.get("ACCOUNT_URL") + "/api/v1/user/get_scoped_users"
    headers = {
        "access-token": app.config.get("INTERNAL_ACCESS_TOKEN")
    }
    page = 1 #request.args.get("page", 1)
    results_per_page = 20 #request.args.get("results_per_page", 20)
    
    params = {
        "page": int(page),
        "results_per_page": int(results_per_page),
        "tid": tenant_id
    }
    resp = requests.get(url, params=params, headers=headers, verify=False)
    return resp.json()

def seed_bank_user_organization(tenant_id):
    
    # users = {
    #     u.username: u
    #     for u in User.query.filter(
    #         User.tenant_id == tenant_id
    #     ).all()
    # }

    users = get_users(tenant_id)
    print("seed_bank_user_organization", users)
    orgs = {
        o.code: o
        for o in OrganizationUnit.query.filter(
            OrganizationUnit.tenant_id == tenant_id
        ).all()
    }

    mappings = [

        # Chi nhánh
        ("admin", "HN_BRANCH", "Manager"),
        ("corporate01", "HN_CORP", "Staff"),
        ("trade01", "HN_TRADE", "Manager"),
        ("ops01", "HN_OPS", "Leader"),

        # Hội sở
        # ("hgiang", "HEAD_OFFICE", "Director"),
        ("cuong_nguyen", "HEAD_OFFICE", "Director"),
        ("risk01", "HO_RISK", "Manager"),
        ("legal01", "HO_LEGAL", "Manager"),
        ("aml01", "HO_AML", "Manager"),
        ("tradeho01", "HO_TRADE", "Director"),
        ("opsho01", "HO_OPS", "Director"),
    ]

    for username, org_code, role in mappings:

        # user = users.get("user_name")
        user = next(
            (x for x in users if x["user_name"] == username),
            None
        )
        print("user accc", user)

        org = orgs.get(org_code)

        if not user or not org:
            continue

        exists = UserOrganization.query.filter(
            UserOrganization.user_id == user.get("id"),
            UserOrganization.organization_id == org.id
        ).first()

        if exists:
            continue

        db.session.add(
            UserOrganization(
                tenant_id=tenant_id,
                user_id=user.get("id"),
                organization_id=org.id,
                role=role,
                is_primary=True
            )
        )

    db.session.commit()


def seed_bank_organization(request=None, **kw):
    current_user = get_current_user(request)
    tenant_id  = get_tenant_id(request)
    if current_user is None or tenant_id is None:
        return json({"error_code": "PERMISSION_DENIED"}, status=401)

    if OrganizationUnit.query.filter_by(
        tenant_id=tenant_id
    ).count() == 0:
        

        company = OrganizationUnit(
            tenant_id=tenant_id,
            code="BANK",
            name="ABC Commercial Bank",
            unit_type="company"
        )
        db.session.add(company)
        db.session.flush()

        # ---------- Head Office ----------

        ho = OrganizationUnit(
            tenant_id=tenant_id,
            parent_id=company.id,
            code="HEAD_OFFICE",
            name="Head Office",
            unit_type="branch"
        )
        db.session.add(ho)
        db.session.flush()

        for code, name in [
            ("HO_TRADE", "Trade Finance"),
            ("HO_RISK", "Risk Management"),
            ("HO_COMPLIANCE", "Compliance"),
            ("HO_LEGAL", "Legal"),
            ("HO_AML", "AML"),
            ("HO_OPS", "Operations"),
        ]:
            db.session.add(
                OrganizationUnit(
                    tenant_id=tenant_id,
                    parent_id=ho.id,
                    code=code,
                    name=name,
                    unit_type="department"
                )
            )

        # ---------- Hanoi Branch ----------

        hn = OrganizationUnit(
            tenant_id=tenant_id,
            parent_id=company.id,
            code="HN_BRANCH",
            name="Ha Noi Branch",
            unit_type="branch"
        )
        db.session.add(hn)
        db.session.flush()

        for code, name in [
            ("HN_CORP", "Corporate Banking"),
            ("HN_TRADE", "Trade Finance"),
            ("HN_OPS", "Operations")
        ]:
            db.session.add(
                OrganizationUnit(
                    tenant_id=tenant_id,
                    parent_id=hn.id,
                    code=code,
                    name=name,
                    unit_type="department"
                )
            )

        # ---------- HCM Branch ----------

        hcm = OrganizationUnit(
            tenant_id=tenant_id,
            parent_id=company.id,
            code="HCM_BRANCH",
            name="Ho Chi Minh Branch",
            unit_type="branch"
        )
        db.session.add(hcm)
        db.session.flush()

        for code, name in [
            ("HCM_CORP", "Corporate Banking"),
            ("HCM_TRADE", "Trade Finance"),
            ("HCM_OPS", "Operations")
        ]:
            db.session.add(
                OrganizationUnit(
                    tenant_id=tenant_id,
                    parent_id=hcm.id,
                    code=code,
                    name=name,
                    unit_type="department"
                )
            )
    db.session.commit()
    seed_bank_user_organization(tenant_id)
    


# OrganizationUnit, UserOrganization

apimanager.create_api(collection_name='organization_unit', model=OrganizationUnit,
    methods=['POST', 'DELETE', 'PUT'],
    url_prefix='/api/v1',
    preprocess=dict(GET_SINGLE=[auth_func], GET_MANY=[auth_func, seed_bank_organization, filter_tenant_id], 
            POST=[auth_func,add_tenant_id],
            PUT_SINGLE=[auth_func,add_tenant_id], PUT_MANY=[deny_request], 
            DELETE_MANY=[deny_request], DELETE_SINGLE=[auth_func]),
    postprocess=dict(GET_SINGLE=[], GET_MANY=[], POST=[], 
            PUT_SINGLE=[],  DELETE_SINGLE=[], DELETE_MANY=[]),)



apimanager.create_api(collection_name='user_organization', model=UserOrganization,
    methods=['POST', 'DELETE', 'PUT'],
    url_prefix='/api/v1',
    preprocess=dict(GET_SINGLE=[auth_func], GET_MANY=[auth_func, filter_tenant_id], 
            POST=[auth_func,add_tenant_id],
            PUT_SINGLE=[auth_func,add_tenant_id], PUT_MANY=[deny_request], 
            DELETE_MANY=[deny_request], DELETE_SINGLE=[auth_func]),
    postprocess=dict(GET_SINGLE=[], GET_MANY=[], POST=[], 
            PUT_SINGLE=[],  DELETE_SINGLE=[], DELETE_MANY=[]),)
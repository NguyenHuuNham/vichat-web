import asyncio
from collections import defaultdict
from functools import wraps
import math
import warnings
import ujson
from bson.objectid import ObjectId

from gatco.exceptions import GatcoException, ServerError
from gatco.response import json, text, HTTPResponse
from gatco.request import json_loads
from gatco.views import HTTPMethodView

from .helpers import upper_keys

class ProcessingException(GatcoException):
    def __init__(self, message='', status_code=520):
        super(ProcessingException, self).__init__(message, status_code)
        self.status_code = status_code
        self.message = message

class ModelView(HTTPMethodView):
    def __init__(self, motor_db, *args, **kw):
        super(ModelView, self).__init__(*args, **kw)
        self.motor_db = motor_db
        
class API(ModelView):
    def __init__(self, motor_db, collection_name=None, exclude_columns=None,
                 include_columns=None, include_methods=None,
                 validation_exceptions=None, results_per_page=10,
                 max_results_per_page=100, post_form_preprocessor=None,
                 preprocess=None, postprocess=None, primary_key=None, *args, **kw):
        
        super(API, self).__init__(motor_db, *args, **kw)
        
        self.include_methods = include_methods
        self.primary_key = "_id"
        self.collection_name = collection_name
        
        self.postprocess = defaultdict(list)
        self.preprocess = defaultdict(list)
        self.postprocess.update(upper_keys(postprocess or {}))
        self.preprocess.update(upper_keys(preprocess or {}))
        
        for postprocess in self.postprocess['PUT_SINGLE']:
            self.postprocess['PATCH_SINGLE'].append(postprocess)
        for preprocess in self.preprocess['PUT_SINGLE']:
            self.preprocess['PATCH_SINGLE'].append(preprocess)
        for postprocess in self.postprocess['PUT_MANY']:
            self.postprocess['PATCH_MANY'].append(postprocess)
        for preprocess in self.preprocess['PUT_MANY']:
            self.preprocess['PATCH_MANY'].append(preprocess)
            
        #decorate = lambda name, f: setattr(self, name, f(getattr(self, name)))
        
        #for method in ['get', 'post', 'patch', 'put', 'delete']:
        #    decorate(method, catch_integrity_errors(self.motor_db))
    
    async def _search(self, request):
        page = request.args.get("page", "1")
        page = int(page)
        cursor = self.motor_db.db[self.collection_name].find()
        resp = []
        async for data in cursor:
            if "_id" in data:
                data["_id"] = str(data["_id"])
                resp.append(data)
                
        new_page = page + 1
        return json({
                     "num_results": len(resp),
                     "page": page,
                     "next_page": new_page,
                     "objects": resp
                     })
    
    async def get(self, request, instid=None):
        if instid is None:
            return await self._search(request)
        data = await self.motor_db.db[self.collection_name].find_one({'_id': {'$eq': ObjectId(instid)}})
        
        if data is not None:
            if "_id" in data:
                data["_id"] = str(data["_id"])
            return json(data)
        else:
            return json(dict(message='No result found'),status=520)
        
    async def delete(self, request, instid=None):
        id = ObjectId(instid)
        result = await self.motor_db.db[self.collection_name].delete_one({'_id': {'$eq': id}})
        return json({})
    
    async def post(self, request):
        content_type = request.headers.get('Content-Type', "")
        content_is_json = content_type.startswith('application/json')
        
        if not content_is_json:
            msg = 'Request must have "Content-Type: application/json" header'
            return json(dict(message=msg),status=520)
        try:
            data = request.json or {}
        except (ServerError, TypeError, ValueError, OverflowError) as exception:
            #current_app.logger.exception(str(exception))
            return json(dict(message='Unable to decode data'),status=520)
        
        if "_id" in data:
            del data["_id"]
        
        if self.primary_key is not None:
            result = await self.motor_db.db[self.collection_name].insert_one(data)
            data["_id"] = str(result.inserted_id)
            return json(data)
        
        return json(None, status=520)
    
    async def put(self, request, instid=None):
        content_type = request.headers.get('Content-Type', "")
        content_is_json = content_type.startswith('application/json')
        
        if not content_is_json:
            msg = 'Request must have "Content-Type: application/json" header'
            return json(dict(message=msg),status=520)
        try:
            data = request.json or {}
        except (ServerError, TypeError, ValueError, OverflowError) as exception:
            #current_app.logger.exception(str(exception))
            return json(dict(message='Unable to decode data'),status=520)
        
        if "_id" in data:
            del data["_id"]
        
        id = ObjectId(instid)
        result = await self.motor_db.db[self.collection_name].update_one({'_id': id}, {'$set': data})
        data["_id"] = instid
        return json(data)
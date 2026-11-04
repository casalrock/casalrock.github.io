/* Base de datos de mentira para las pruebas: guarda todo en el propio navegador y nunca toca la base de datos real */
(function(){
  function load(){try{return JSON.parse(localStorage.getItem("__fakedb")||"{}")}catch(e){return{}}}
  function save(db){localStorage.setItem("__fakedb",JSON.stringify(db))}
  function q(table){
    var st={op:"select",filt:null,single:false,row:null};
    var b={
      select:function(){st.op=st.op==="del"?"del":"select";return b},
      upsert:function(row){st.op="upsert";st.row=row;return b},
      delete:function(){st.op="del";return b},
      eq:function(c,v){st.filt=[c,String(v)];return b},
      maybeSingle:function(){st.single=true;return b},
      then:function(res,rej){
        var db=load();db[table]=db[table]||{};var t=db[table],out={error:null,data:null};
        if(st.op==="upsert"){t[st.row.id]=st.row;save(db);window.__writes=(window.__writes||0)+1}
        else if(st.op==="del"){if(st.filt)delete t[st.filt[1]];save(db)}
        else{var rows=Object.values(t);if(st.filt)rows=rows.filter(function(r){return String(r[st.filt[0]])===st.filt[1]});out.data=st.single?(rows[0]||null):rows}
        return Promise.resolve(out).then(res,rej);
      }
    };return b;
  }
  var client={from:q,channel:function(){var c={on:function(){return c},subscribe:function(){return c}};return c}};
  window.supabase={createClient:function(){return client}};
  Object.defineProperty(window,"supabase",{value:window.supabase,writable:false});
})();

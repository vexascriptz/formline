"""Public auto-session tests; never connects to YouTube."""
import importlib.util, sys, time
from pathlib import Path
from fastapi.testclient import TestClient

root=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('guest_drop_app',root/'app.py')
appmod=importlib.util.module_from_spec(spec);sys.modules['guest_drop_app']=appmod;spec.loader.exec_module(appmod)
client=TestClient(appmod.app)

def test_guest_session_securely_scoped_and_rate_limited():
    session=client.post('/api/guest/session'); assert session.status_code==200
    token=session.json()['token']; assert token and token != appmod.AUTH['token']
    headers={'Authorization':'Bearer '+token}
    assert client.post('/api/guest/jobs',json={'video_id':'https://example.com/','format':'mp4','quality':'720'},headers=headers).status_code==422
    assert client.post('/api/guest/jobs',json={'video_id':'dQw4w9WgXcQ','format':'mp4','quality':'999'},headers=headers).status_code==422
    assert client.post('/api/guest/jobs',json={'video_id':'dQw4w9WgXcQ','format':'mp4','quality':'720'}).status_code==401
    assert client.post('/api/jobs',json={'video_id':'dQw4w9WgXcQ'},headers=headers).status_code==401

def test_guest_download_and_job_ownership():
    def fake_process(job):
        folder=appmod.OUTPUTS/job.id;folder.mkdir(parents=True,exist_ok=True)
        media=folder/'media.mp4';media.write_bytes(b'guest-test-file')
        appmod._set(job,state='ready',progress=100,message='Ready',completed=time.time(),filename='guest-test.mp4',file_path=media,ticket='ticket123')
    appmod.process=fake_process
    token1=client.post('/api/guest/session').json()['token']
    token2=client.post('/api/guest/session').json()['token']
    h1={'Authorization':'Bearer '+token1};h2={'Authorization':'Bearer '+token2}
    create=client.post('/api/guest/jobs',json={'video_id':'dQw4w9WgXcQ','format':'mp4','quality':'720'},headers=h1)
    assert create.status_code==200,create.text
    id=create.json()['id']
    assert client.get('/api/guest/jobs/'+id,headers=h2).status_code==404
    for _ in range(100):
        res=client.get('/api/guest/jobs/'+id,headers=h1).json()
        if res['state']=='ready':break
        time.sleep(.01)
    assert res['state']=='ready',res
    assert client.get(f'/api/jobs/{id}/file/ticket123').content==b'guest-test-file'

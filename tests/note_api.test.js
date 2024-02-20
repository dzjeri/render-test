const supertest = require('supertest');
const mongoose = require('mongoose');
const helper = require('./test_helper');
const bcrypt = require('bcrypt');
const app = require('../app');
const api = supertest(app);

const Note = require('../models/note');
const User = require('../models/user');

describe('when there is initially some notes saved', () => {
  beforeEach(async () => {
    await Note.deleteMany({});

    const noteObjects = helper.initialNotes
      .map(note => new Note(note));
    const promiseArray = noteObjects.map(note => note.save());
    await Promise.all(promiseArray);

    // for (let note of helper.initialNotes) {
    //   const noteObject = new Note(note);
    //   await noteObject.save();
    // }
  });

  test('notes are returned as json', async () => {
    await api
      .get('/api/notes')
      .expect(200)
      .expect('Content-Type', /application\/json/);
  });

  test('all notes are returned', async () => {
    const response = await api.get('/api/notes');

    expect(response.body).toHaveLength(helper.initialNotes.length);
  });

  test('a specific note is within the returned notes', async () => {
    const response = await api.get('/api/notes');

    const contents = response.body.map(r => r.content);
    expect(contents).toContain(
      'Browser can execute only JavaScript'
    );
  });

  describe('viewing a specific note', () => {
    test('succeeds with a valid id', async () => {
      const notesAtStart = await helper.notesInDb();

      const noteToView = notesAtStart[0];

      const resultNote = await api
        .get(`/api/notes/${noteToView.id}`)
        .expect(200)
        .expect('Content-Type', /application\/json/);

      expect(resultNote.body).toEqual(noteToView);
    });

    test('fails with statuscode 404 if note does not exist', async () => {
      const validNonexistingId = await helper.nonExistingId();

      await api
        .get(`/api/notes/${validNonexistingId}`)
        .expect(404);
    });

    test('fails with statuscode 400 if id is invalid', async () => {
      const invalidId = '5a3d5da59070081a82a3445';

      await api
        .get(`/api/notes/${invalidId}`)
        .expect(400);
    });
  });

  describe('addition of a new note', () => {
    // test('succeeds with valid data', async () => {
    //   const newNote = {
    //     content: 'async/await simplifies making async calls',
    //     important: true
    //   };

    //   await api
    //     .post('/api/notes')
    //     .send(newNote)
    //     .expect(201)
    //     .expect('Content-Type', /application\/json/);

    //   const notesAtEnd = await helper.notesInDb();
    //   expect(notesAtEnd).toHaveLength(helper.initialNotes.length + 1);

    //   const contents = notesAtEnd.map(n => n.content);
    //   expect(contents).toContain(
    //     'async/await simplifies making async calls'
    //   );
    // });

    //   test('fails with status code 400 if data is invalid', async () => {
    //     const newNote = {
    //       important: true
    //     };

    //     await api
    //       .post('/api/notes')
    //       .send(newNote)
    //       .expect(400);

    //     const notesAtEnd = await helper.notesInDb();

  //     expect(notesAtEnd).toHaveLength(helper.initialNotes.length);
  //   });
  });

  describe('deletion of a note', () => {
    test('a note can be deleted', async () => {
      const notesAtStart = await helper.notesInDb();
      const noteToDelete = notesAtStart[0];

      await api
        .delete(`/api/notes/${noteToDelete.id}`)
        .expect(204);

      const notesAtEnd = await helper.notesInDb();

      expect(notesAtEnd).toHaveLength(
        helper.initialNotes.length - 1
      );

      const contents = notesAtEnd.map(r => r.content);

      expect(contents).not.toContain(noteToDelete.content);
    });
  });
});

describe('when there is initially one user in db', () => {
  beforeEach(async () => {
    await User.deleteMany({});

    const passwordHash = await bcrypt.hash('secret', 10);
    const user = new User({ username: 'root', passwordHash });

    await user.save();
  });

  test('creation succeeds with a fresh username', async () => {
    const usersAtStart = await helper.usersInDb();

    const newUser = {
      username: 'mluukai',
      name: 'Matti Luukainen',
      password: 'salainen'
    };

    await api
      .post('/api/users')
      .send(newUser)
      .expect(201)
      .expect('Content-Type', /application\/json/);

    const usersAtEnd = await helper.usersInDb();
    expect(usersAtEnd).toHaveLength(usersAtStart.length + 1);

    const usernames = usersAtEnd.map(u => u.username);
    expect(usernames).toContain(newUser.username);
  });

  test('creation fails with proper statuscode and message if username already taken', async () => {
    const usersAtStart = await helper.usersInDb();

    const newUser = {
      username: 'root',
      name: 'Superuser',
      password: 'salainen'
    };

    const result = await api
      .post('/api/users')
      .send(newUser)
      .expect(400)
      .expect('Content-Type', /application\/json/);

    expect(result.body.error).toContain('expected `username` to be unique');

    const usersAtEnd = await helper.usersInDb();
    expect(usersAtEnd).toEqual(usersAtStart);
  });

  describe('addition of a note', () => {
    test('succeeds with valid data', async () => {
      const response = await api
        .post('/api/login')
        .send({ username: 'root', password: 'secret' });
      const token = response.body.token;

      const newNote = {
        content: 'This note was created by authorized root user',
        important: true
      };

      const lengthBefore = (await helper.notesInDb()).length;

      await api
        .post('/api/notes')
        .set('Authorization', `Bearer ${token}`)
        .send(newNote)
        .expect(201)
        .expect('Content-Type', /application\/json/);

      const notes = await helper.notesInDb();
      expect(notes).toHaveLength(lengthBefore + 1);

      const contents = notes.map(n => n.content);
      expect(contents).toContain('This note was created by authorized root user');
    });

    test('fails if there is no content', async () => {
      const loginResponse = await api
        .post('/api/login')
        .send({ username: 'root', password: 'secret' });
      const token = loginResponse.body.token;

      const faultyNote = {
        important: true
      };

      const noteResponse = await api
        .post('/api/notes')
        .set('Authorization', `Bearer ${token}`)
        .send(faultyNote)
        .expect(400);
      const error = noteResponse.body.error;
      expect(error).toBe('Note validation failed: content: Path `content` is required.');
    });
  });
});

afterAll(async () => {
  await mongoose.connection.close();
});